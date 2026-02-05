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
 * For up-loads: we remember the first item's key and the spinner height,
 * then scroll to firstItemTop + spinnerHeight after loading.
 */
interface ScrollAnchor {
  key: string;
  spinnerHeight: number;
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
/** Maximum time to wait for DOM element to appear */
const DOM_WAIT_TIMEOUT_MS = 1000;
/** Minimum scroll delta to trigger adjustment (prevents micro-adjustments) */
const MIN_SCROLL_DELTA = 1;

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
const scrollToKey = (key: string, behavior?: ScrollBehavior): void => {
  const containerEl = props.useWindow ? rootEl : scrollViewRef.value;
  const el = containerEl?.querySelector(`[data-item-key="${key}"]`);
  if (el) {
    el.scrollIntoView({ behavior, block: "start" });
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
  // if (props.useWindow) return 0;
  return scrollViewRef.value?.getBoundingClientRect().top ?? 0;
};

/** Find a list item element by its data-item-key attribute */
const findElementByKey = (key: string): Element | null => {
  const wrapper = scrollViewRef.value;
  if (!wrapper) return null;
  return wrapper.querySelector(`[data-item-key="${key}"]`);
};

/**
 * Measures the spinner wrapper's height.
 * This is used to calculate scroll offset for up-loads.
 * 
 * @returns The spinner height in pixels, or 0 if not measurable
 */
const measureSpinnerHeight = (): number => {
  if (!spinnerWrapperRef.value) return 0;
  return spinnerWrapperRef.value.getBoundingClientRect().height;
};

/**
 * Creates a scroll anchor for up-loads.
 * Simply stores the first item's key - spinner height will be measured after spinner renders.
 * 
 * @param items - Current items array
 * @returns ScrollAnchor object or null if no suitable anchor found
 */
const createUpLoadAnchor = (items: T[]): { key: string } | null => {
  if (items.length === 0) return null;
  
  const anchorItem = items[0] as T;
  const anchorKey = props.itemKey(anchorItem);
  
  return { key: anchorKey };
};

/**
 * Restores scroll position for up-loads using the spinner-height approach.
 * After loading: scroll to anchorTop + spinnerHeight
 * 
 * @param anchorKey - The key of the anchor item
 * @param spinnerHeight - The measured height of the spinner
 */
const restoreScrollAfterUpLoad = async (anchorKey: string, spinnerHeight: number): Promise<void> => {
  const element = findElementByKey(anchorKey);
  
  if (!element) {
    return;
  }
  const { top } = element.getBoundingClientRect()
  const anchorTop = top - getViewportTop();
  const targetScrollTop = anchorTop - spinnerHeight;

  if (Math.abs(targetScrollTop - getScrollTop()) > MIN_SCROLL_DELTA) {
    setScrollTop(targetScrollTop);
  }
};

/**
 * Trims items array to viewCount and returns information about what was trimmed.
 * Uses consistent logic for both directions.
 * 
 * @param items - Items array to trim
 * @param direction - Load direction (affects trim strategy)
 * @returns Object with trimmed items and metadata
 */
const trimItemsToviewCount = (items: T[], direction: LoadDirection) => {
  if (items.length <= props.viewCount) {
    return {
      trimmedItems: items,
      wasTrimmed: false,
      trimmedFromTop: false
    };
  }
  
  if (direction === "up") {
    // Trim from bottom (end of array) to preserve newly loaded items at top
    return {
      trimmedItems: items.slice(0, props.viewCount),
      wasTrimmed: true,
      trimmedFromTop: false
    };
  } else {
    // Trim from top (beginning of array) to preserve newly loaded items at bottom
    const excess = items.length - props.viewCount;
    return {
      trimmedItems: items.slice(excess),
      wasTrimmed: true,
      trimmedFromTop: true
    };
  }
};

/**
 * Handles loading more items in the specified direction.
 * 
 * Approach for up-loads (simplified):
 * 1. Remember the first item's key as anchor
 * 2. Show spinner and wait for DOM update
 * 3. Measure spinner height
 * 4. Load new items
 * 5. After items render, scroll to anchorTop + spinnerHeight
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
  
  let anchorKey: string | null = null;
  let spinnerHeight = 0;
  
  if (direction === "up") {
    // Remember the anchor item before showing spinner
    const anchor = createUpLoadAnchor(currentItems);
    if (anchor) {
      anchorKey = anchor.key;
    }
    
    // Show spinner
    isUpLoading.value = true;
    
    // Wait for spinner to render, then measure its height
    await nextTick();
    spinnerHeight = measureSpinnerHeight();
  } else {
    isDownLoading.value = true;
  }

  try {
    const refItem: T = direction === "up" 
      ? currentItems[0] as T
      : currentItems[currentItems.length - 1] as T;
      
    const newItems: T[] = await props.onLoadMore(direction, refItem);

    if (newItems.length === 0) {
      return;
    }

    // Merge new items with existing items
    const mergedItems: T[] = direction === "up" 
      ? [...newItems, ...currentItems] as T[]
      : [...currentItems, ...newItems] as T[];

    // Trim to viewCount and get trim information
    const { trimmedItems, wasTrimmed, trimmedFromTop } = trimItemsToviewCount(mergedItems, direction);
    
    // Update anchor key if items were trimmed from top
    if (direction === "up" && wasTrimmed && trimmedFromTop && trimmedItems.length > 0) {
      // Original anchor might have been trimmed, use new first item
      anchorKey = props.itemKey(trimmedItems[0] as T);
    }

    // Commit the new items (this will hide the spinner)
    props.onItemsChange?.(trimmedItems);
    
    // Hide spinner
    if (direction === "up") isUpLoading.value = false;
    else isDownLoading.value = false;

    // Wait for DOM update (spinner removal + new items render)
    await nextTick();
    
    // Restore scroll position for up-loads
    if (direction === "up" && anchorKey) {
      await restoreScrollAfterUpLoad(anchorKey, spinnerHeight);
    }

  } catch (error) {
    console.error(`[BidirectionalList] Load error (${direction}):`, error);
  } finally {
    // Clean up loading state (in case not already done)
    if (direction === "up") isUpLoading.value = false;
    else isDownLoading.value = false;
    
    isAdjustingRef.value = false;
    
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
  [() => props.threshold, () => props.useWindow, () => props.disable],
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
    <div ref="listWrapperRef" :class="props.listClassName">
      <div
        v-for="item in props.items"
        :key="props.itemKey(item)"
        :data-item-key="props.itemKey(item)"
      >
        <slot name="item" :item="item">
          {{ item }}
        </slot>
      </div>
    </div>
    <slot v-if="isDownLoading" name="spinner">
      <div :style="{ padding: '20px', textAlign: 'center' }">Loading...</div>
    </slot>
    <div ref="bottomSentinelRef" :style="{ height: '10px', marginTop: '-10px' }" />
    <slot
      v-if="props.items.length === 0 && !isUpLoading && !isDownLoading"
      name="empty"
    />
  </div>
</template>