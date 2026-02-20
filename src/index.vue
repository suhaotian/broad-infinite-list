<script setup lang="ts" generic="T">
/**
 * BidirectionalList - Vue 3 Component for Infinite Bidirectional Scrolling
 * 
 * A highly optimized infinite scroll list that loads content in both directions (up and down).
 * Maintains viewport performance by trimming items outside the viewCount limit.
 * 
 * Usage:
 * ```vue
 * <BidirectionalList
 *   ref="listRef"
 *   :items="items"
 *   :item-key="(item) => item.id"
 *   :on-load-more="handleLoadMore"
 *   :on-items-change="handleItemsChange"
 *   :has-previous="true"
 *   :has-next="true"
 * >
 *   <template #item="{ item }">
 *     <div>{{ item.text }}</div>
 *   </template>
 * </BidirectionalList>
 * ```
 * 
 * @module BidirectionalList
 */

import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  type Ref,
  type CSSProperties,
} from "vue";


export interface BidirectionalListRef {
  scrollViewRef: Ref<HTMLElement | null>;
  scrollToTop: (behavior?: ScrollBehavior) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  scrollToKey: (key: string, behavior?: ScrollBehavior) => void;
  /** get Current distnace to top */
  getTopDistance: () => number;
  /** get Current distnace to bottom */
  getBottomDistance: () => number;
}

/**
 * Slot types for the BidirectionalList component.
 * Defines the scoped slot props available to consumers.
 */
export interface BidirectionalListSlots<T> {
  /** 
   * Slot for rendering each item in the list.
   * This is the equivalent of the React renderItem prop.
   * @param props - Scoped slot props containing the current item
   */
  item(props: { item: T }): any;
  
  /**
   * Slot for the loading spinner shown during data fetching.
   * Displayed both above (when loading up) and below (when loading down).
   * This is the equivalent of the React spinnerRow prop.
   */
  spinner(): any;
  
  /**
   * Slot for content displayed when the items array is empty.
   * This is the equivalent of the React emptyState prop.
   */
  empty(): any;
}

type LoadDirection = "up" | "down";

/**
 * Scroll anchor data structure for position restoration.
 * Stores an element's key and its visual offset from the viewport/container top.
 */
interface ScrollAnchor {
  key: string;
  offset: number;
}

/**
 * Pending scroll restoration info, set before DOM updates, consumed after render.
 */
interface PendingRestore {
  type: "prepend" | "down-trim";
  anchor: ScrollAnchor | null;
}

/**
 * Define and type the component's slots.
 * This provides TypeScript autocomplete and validation for slot usage.
 */
defineSlots<BidirectionalListSlots<T>>();


const props = withDefaults(
  defineProps<{
    /** Current array of items to display */
    items: T[];
    /** Function to extract a unique key from each item */
    itemKey: (item: T) => string;
    /** Called when more items should be loaded; returns the new items to prepend/append */
    onLoadMore: (direction: "up" | "down", refItem: T) => Promise<T[]>;
    /** Called when the items array changes due to loading or trimming */
    onItemsChange?: (items: T[]) => void;
    /** The container div's className */
    className?: string;
    /** The list wrapper div's className */
    listClassName?: string;
    /** container element, default: div */
    as?: React.ElementType;
    /** item element, default: div */
    itemAs?: React.ElementType;
    /** The list item tag's className */
    itemClassName?: string | string[] | ((item: T, index: number) => string | string[]);
    /** Maximum number of items to keep in DOM; older items are trimmed */
    viewCount?: number;
    /** Pixel distance from edge to trigger loading */
    threshold?: number;
    /** If true, use window scroll instead of container scroll */
    useWindow?: boolean;
    /** Whether there are more items available above the current view */
    hasPrevious: boolean;
    /** Whether there are more items available below the current view */
    hasNext: boolean;
    /** If true, disable loading in both directions */
    disable?: boolean;
    /** Called when a programmatic scroll adjustment begins */
    onScrollStart?: () => void;
    /** Called when a programmatic scroll adjustment ends */
    onScrollEnd?: () => void;
  }>(),
  {
    viewCount: 50,
    threshold: 10,
    useWindow: false,
    disable: false,
  }
);

/** Cooldown period in milliseconds between load operations to prevent race conditions */
const LOAD_COOLDOWN_MS = 150;
/** Minimum scroll delta to trigger adjustment (prevents micro-adjustments) */
const MIN_SCROLL_DELTA = 1;

/** Next tick layout helper for Safari-compatible timing */
const nextTickLayout = (callback: () => void): Promise<void> => {
    return new Promise((resolve) => {
      nextTick(() => {
        requestAnimationFrame(() => {
          callback();
          resolve();
        });
      });
    });
  };

/** Reference to the scrollable container element */
const scrollViewRef = ref<HTMLElement | null>(null);
/** Reference to the list wrapper that contains all items */
const listWrapperRef = ref<HTMLDivElement | null>(null);
/** Top sentinel element for IntersectionObserver */
const topSentinelRef = ref<HTMLDivElement | null>(null);
/** Bottom sentinel element for IntersectionObserver */
const bottomSentinelRef = ref<HTMLDivElement | null>(null);
/** Reference to the spinner wrapper div (for measuring spinner height) */
const spinnerWrapperRef = ref<HTMLDivElement | null>(null);
/** Lock to prevent concurrent load operations in the same direction */
const loadingLockRef: Record<LoadDirection, boolean> = {
  up: false,
  down: false,
};
/** Whether currently loading items from above */
const isUpLoading = ref(false);
/** Whether currently loading items from below */
const isDownLoading = ref(false);
/** Whether currently adjusting scroll position (prevents triggering new loads) */
const isAdjustingRef = ref(false);
/** Internal copy of items array for use during async operations */
const itemsRef = ref<T[]>([]);
/** Reference to document root element for window scroll mode */
const rootEl = document.documentElement;
/** IntersectionObserver instance for detecting when to load more items */
const intersectionObserver = ref<IntersectionObserver | null>(null);
/** Pending scroll restoration data, set before DOM update, consumed after */
const pendingRestoreRef = ref<PendingRestore | null>(null);

/**
 * Sync itemsRef with props.items
 * We maintain an internal copy to safely reference during async load operations
 */
watch(
  () => props.items,
  (newItems) => {
    itemsRef.value = newItems;
  },
  { immediate: true }
);

/** Scroll to a specific pixel offset from top */
const scrollTo = (top: number, behavior: ScrollBehavior = "smooth"): void => {
  if (props.useWindow) {
    rootEl.scrollTo({ top, behavior });
  } else if (scrollViewRef.value) {
    scrollViewRef.value.scrollTo({ top, behavior });
  }
};

/** Scroll to an item by its key */
const scrollToKey = (key: string, behavior?: ScrollBehavior, block: ScrollLogicalPosition = 'start'): void => {
  const containerEl = props.useWindow ? rootEl : scrollViewRef.value;
  const el = containerEl?.querySelector(`[data-id="${key}"]`);
  if (el) {
    el.scrollIntoView({ behavior, block });
  }
};

/** Scroll to the top of the list */
const scrollToTop = (behavior?: ScrollBehavior): void => {
  scrollTo(0, behavior);
};

/** Scroll to the bottom of the list */
const scrollToBottom = (behavior?: ScrollBehavior): void => {
  const container = props.useWindow ? rootEl : scrollViewRef.value;
  if (container) {
    const height = container.scrollHeight;
    scrollTo(height, behavior);
  }
};


  const getTopDistance = () => {
    const container = props.useWindow ? rootEl : scrollViewRef.value;
    return (container?.scrollTop || 0) as number;
  }

  const getBottomDistance = () => {
    const container = props.useWindow ? rootEl : scrollViewRef.value;
    if (!container) return 0;

    // scrollHeight: Total height of the content
    // scrollTop: How far we've scrolled from the top
    // clientHeight: The visible height of the container
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight
    );
  }

/**
 * Expose public API to parent components via template ref.
 * This allows imperative control of scrolling from outside the component.
 */
defineExpose<BidirectionalListRef>({
  scrollViewRef: props.useWindow ? { value: rootEl } as typeof scrollViewRef : scrollViewRef,
  scrollTo,
  scrollToKey,
  scrollToTop,
  scrollToBottom,
  getTopDistance,
  getBottomDistance,
});

/** Get current scroll position (works for both window and container scroll) */
const getScrollTop = (): number => {
  if (props.useWindow) return window.scrollY || rootEl.scrollTop;
  return scrollViewRef.value?.scrollTop ?? 0;
};

/** Set scroll position and notify callbacks */
const setScrollTop = (value: number): void => {
  props.onScrollStart?.();
  if (props.useWindow) rootEl.scrollTop = value;
  else if (scrollViewRef.value) scrollViewRef.value.scrollTop = value;
  props.onScrollEnd?.();
};

/** Get the viewport-relative top position of the container */
const getViewportTop = (): number => {
  if (props.useWindow) return 0;
  return scrollViewRef.value?.getBoundingClientRect().top ?? 0;
};

/** Find a list item element by its data-id attribute */
const findElementByKey = (key: string): Element | null => {
  const wrapper = props.useWindow ? rootEl : scrollViewRef.value;
  if (!wrapper) return null;
  return wrapper.querySelector(`[data-id="${key}"]`);
};

/**
 * Snapshot an element's visual position relative to the viewport/container top.
 * This captures where the element appears on screen before DOM changes.
 * 
 * @param key - The data-id of the element to snapshot
 * @returns ScrollAnchor object or null if element not found
 */
const snapshotAnchor = (key: string): ScrollAnchor | null => {
  const el = findElementByKey(key);
  if (!el) return null;
  return {
    key,
    offset: el.getBoundingClientRect().top - getViewportTop(),
  };
};

/**
 * Compute how far to adjust scrollTop so that an anchor element stays
 * at its previous visual offset. Returns 0 if not applicable.
 * 
 * @param anchor - The previously snapshotted anchor
 * @returns Scroll delta in pixels, or 0 if no adjustment needed
 */
const computeAnchorDelta = (anchor: ScrollAnchor | null): number => {
  if (!anchor) return 0;
  const el = findElementByKey(anchor.key);
  if (!el) return 0;
  const currentOffset = el.getBoundingClientRect().top - getViewportTop();
  const delta = currentOffset - anchor.offset;
  
  return Math.abs(delta) > MIN_SCROLL_DELTA ? delta : 0;
};

/**
 * Apply pending scroll restoration after DOM update.
 * Uses nextTickLayout to ensure Safari has completed layout before measuring.
 */
const applyScrollRestore = (spinnerHeight = 0): void => {
  nextTickLayout(() => {
    const pending = pendingRestoreRef.value;
    if (!pending) {
      isAdjustingRef.value = false;
      return;
    }
    pendingRestoreRef.value = null;

    const delta = computeAnchorDelta(pending.anchor);
    if (delta !== 0) {
      setScrollTop(getScrollTop() + delta - spinnerHeight);
    }

    isAdjustingRef.value = false;
  });
};

/**
 * Handles loading more items in the specified direction.
 * 
 * Approach (matches React version for iOS compatibility):
 * 
 * UP-LOAD:
 * 1. Show spinner and wait for it to render
 * 2. Snapshot first item's position (which now sits below spinner)
 * 3. Load new items
 * 4. After render, restore first item to its snapshotted position
 * 
 * DOWN-LOAD:
 * 1. Load new items
 * 2. If trimming occurs, snapshot new first item before trim
 * 3. After render, restore new first item to its snapshotted position
 * 
 * @param direction - "up" to load older items, "down" to load newer items
 */
const handleLoad = async (direction: LoadDirection): Promise<void> => {
  // Early exits: disabled, no more items, or already loading this direction
  if (props.disable) return;
  if (direction === "up" && !props.hasPrevious) return;
  if (direction === "down" && !props.hasNext) return;
  if (loadingLockRef[direction]) return;

  const currentItems = itemsRef.value as T[];
  if (currentItems.length === 0) return;

  // Acquire locks and set loading state
  loadingLockRef[direction] = true;
  isAdjustingRef.value = true;

  const isUp = direction === "up";
  let upSpinnerHeight = 0;

  if (isUp) {
    // Show spinner
    isUpLoading.value = true;
    
    // Wait for spinner to render AND layout to complete, then measure spinner height.
    await nextTickLayout(() => {
      const firstKey = itemsRef.value.length > 0 
        ? props.itemKey(itemsRef.value[0] as T) 
        : null;
      
      if (firstKey) {
        // Measure the spinner wrapper's height
        upSpinnerHeight = spinnerWrapperRef.value?.getBoundingClientRect().height ?? 0;
        
        // Store spinner height as the offset
        // After new items load, the first item should be at this distance from the top
        pendingRestoreRef.value = {
          type: "prepend",
          anchor: { key: firstKey, offset: upSpinnerHeight },
        };
      }
    });
  } else {
    isDownLoading.value = true;
  }

  try {
    const refItem: T = isUp 
      ? currentItems[0] as T
      : currentItems[currentItems.length - 1] as T;
      
    const newItems: T[] = await props.onLoadMore(direction, refItem);

    if (newItems.length === 0) {
      if (isUp) isUpLoading.value = false;
      else isDownLoading.value = false;
      isAdjustingRef.value = false;
      return;
    }

    if (isUp) {
      // Prepend new items
      let nextItems = [...newItems, ...currentItems] as T[];
      
      // Trim from bottom if needed
      if (nextItems.length > props.viewCount) {
        nextItems = nextItems.slice(0, props.viewCount);
      }

      // Commit changes
      props.onItemsChange?.(nextItems);
      isUpLoading.value = false;
      
      // Restore scroll after layout completes
      applyScrollRestore(props.useWindow ? upSpinnerHeight : 0);
      
    } else {
      // Append new items
      let nextItems = [...currentItems, ...newItems] as T[];
      let didTrim = false;

      // Trim from top if needed
      if (nextItems.length > props.viewCount) {
        const countToRemove = nextItems.length - props.viewCount;
        
        // The element at index countToRemove in the CURRENT array will become
        // the first element after trimming. Snapshot it NOW while it's still in the DOM.
        const anchorKey = props.itemKey(nextItems[countToRemove] as T);
        
        // Snapshot before trimming - this element exists in current DOM
        pendingRestoreRef.value = {
          type: "down-trim",
          anchor: snapshotAnchor(anchorKey),
        };
        
        nextItems = nextItems.slice(countToRemove);
        didTrim = true;
      }

      // Commit changes
      props.onItemsChange?.(nextItems);
      isDownLoading.value = false;

      if (didTrim) {
        // Restore scroll after layout completes
        applyScrollRestore();
      } else {
        isAdjustingRef.value = false;
      }
    }

  } catch (error) {
    console.error(`[BidirectionalList] Load error (${direction}):`, error);
    if (isUp) isUpLoading.value = false;
    else isDownLoading.value = false;
    isAdjustingRef.value = false;
  } finally {
    // Release lock after cooldown
    setTimeout(() => {
      loadingLockRef[direction] = false;
    }, LOAD_COOLDOWN_MS);
  }
};

/**
 * Sets up the IntersectionObserver to detect when to trigger loading.
 * Observes top and bottom sentinel elements with a threshold margin.
 * When sentinels enter the viewport, triggers loading in the corresponding direction.
 */
const setupObserver = (): void => {
  const top = topSentinelRef.value;
  const bottom = bottomSentinelRef.value;
  if (!top || !bottom || props.disable) return;
  if (!props.hasNext && !props.hasPrevious) return;

  const root: HTMLElement | null = props.useWindow ? null : scrollViewRef.value;
  intersectionObserver.value = new IntersectionObserver(
    (entries: IntersectionObserverEntry[]) => {
      if (isAdjustingRef.value) return;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        if (e.target === top) handleLoad("up");
        else if (e.target === bottom) handleLoad("down");
      }
    },
    {
      root,
      rootMargin: `${props.threshold}px 0px ${props.threshold}px 0px`,
      threshold: 0,
    }
  );
  intersectionObserver.value.observe(top);
  intersectionObserver.value.observe(bottom);
};

/** Setup observer when component mounts */
onMounted(() => {
  setupObserver();
});

/** Cleanup observer when component unmounts to prevent memory leaks */
onUnmounted(() => {
  intersectionObserver.value?.disconnect();
});

/**
 * Recreate observer when threshold, scroll mode, or disable state changes.
 * This ensures the observer configuration stays in sync with props.
 */
watch(
  [() => props.threshold, () => props.useWindow, () => props.disable, () => props.hasNext, () => props.hasPrevious],
  () => {
    intersectionObserver.value?.disconnect();
    nextTick(() => {
      setupObserver();
    });
  }
);

/**
 * Container styles - applies scroll behavior only when not using window scroll.
 * When useWindow is true, scrolling is handled by the browser window instead.
 */
const containerStyles = computed<CSSProperties>(() => {
  return props.useWindow ? {} : { height: "100%", overflowY: "auto" };
});

const tag = props.as ?? 'div';
const itemTag = props.itemAs ?? 'div';
function resolveItemClass(item: T, index: number) {
  if (!props.itemClassName) return "";
  if (typeof props.itemClassName === "string" || Array.isArray(props.itemClassName)) {
    return props.itemClassName;
  }
  return props.itemClassName(item, index);
}
</script>

<template>
  <div ref="scrollViewRef" :style="containerStyles" :class="props.className">
    <div
      ref="topSentinelRef"
      :style="{ height: '1px', marginBottom: '-1px', overflowAnchor: 'none' }"
    />
    <div v-if="isUpLoading" ref="spinnerWrapperRef">
      <slot name="spinner">
        <div :style="{ padding: '20px', textAlign: 'center' }">Loading...</div>
      </slot>
    </div>
    <component :is='tag' ref="listWrapperRef" :class="props.listClassName">
      <component
        :is='itemTag'
        v-for="(item, index) in props.items"
        :key="props.itemKey(item)"
        :data-id="props.itemKey(item)"
        :class='resolveItemClass(item, index)'
      >
        <slot name="item" :item="item">
          {{ item }}
        </slot>
      </component>
    </component>
    <slot v-if="isDownLoading" name="spinner">
      <div :style="{ padding: '20px', textAlign: 'center' }">Loading...</div>
    </slot>
    <div ref="bottomSentinelRef" :style="{ height: '1px', marginTop: '-1px' }" />
    <slot
      v-if="props.items.length === 0 && !isUpLoading && !isDownLoading"
      name="empty"
    />
  </div>
</template>