
<script setup lang="ts" generic="T">
/**
 * BidirectionalList - Vue 3 Component for Infinite Bidirectional Scrolling
 * 
 * A highly optimized infinite scroll list that loads content in both directions (up and down).
 * Maintains viewport performance by trimming items outside the viewSize limit.
 * 
 * Key Features:
 * - Bidirectional infinite scroll (load older items upward, newer items downward)
 * - Smart scroll restoration after prepending items (prevents viewport jumping)
 * - Automatic viewport trimming to maintain performance with large datasets
 * - IntersectionObserver-based loading triggers (no scroll event listeners)
 * - Race condition prevention via load locks and adjustment tracking
 * - Support for both window scroll and container scroll modes
 * 
 * Technical Implementation:
 * - Uses IntersectionObserver with sentinel elements to detect when to load
 * - For up-loads: snapshots anchor element position, prepends items, restores scroll
 * - For down-loads: relies on CSS overflow-anchor for native scroll preservation
 * - Trims items outside viewSize to prevent DOM bloat
 * - Waits for Vue DOM updates (MutationObserver) before scroll measurements
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
    viewSize?: number;
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
    viewSize: 30,
    threshold: 200,
    useWindow: false,
    disable: false,
  }
);

/** Cooldown period in milliseconds between load operations to prevent race conditions */
const LOAD_COOLDOWN_MS = 150;
/** Shorthand for requestAnimationFrame */
const RFA = requestAnimationFrame;

/** Reference to the scrollable container element */
const scrollViewRef = ref<HTMLElement | null>(null);
/** Reference to the list wrapper that contains all items */
const listWrapperRef = ref<HTMLDivElement | null>(null);
/** Top sentinel element for IntersectionObserver */
const topSentinelRef = ref<HTMLDivElement | null>(null);
/** Bottom sentinel element for IntersectionObserver */
const bottomSentinelRef = ref<HTMLDivElement | null>(null);
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
  scrollViewRef: props.useWindow ? { value: rootEl } as typeof scrollViewRef: scrollViewRef,
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
  if (props.useWindow) return 0;
  return scrollViewRef.value?.getBoundingClientRect().top ?? 0;
};

/** Find a list item element by its data-item-key attribute */
const findElementByKey = (key: string): Element | null => {
  const wrapper = listWrapperRef.value;
  if (!wrapper) return null;
  return wrapper.querySelector(`[data-item-key="${key}"]`);
};

/**
 * Restores scroll position so the anchor element stays visually pinned after DOM changes.
 * Used after prepending items or trimming to maintain the user's scroll position.
 * Retries up to 10 times if the anchor isn't in the DOM yet (waiting for Vue to flush updates).
 * 
 * @param anchorKey - The item key of the element to keep pinned
 * @param anchorOffsetBefore - The viewport-relative offset of the anchor before DOM changes
 */
const restoreScrollToAnchor = (
  anchorKey: string,
  anchorOffsetBefore: number
): void => {
  let attempts = 0;
  const maxAttempts = 10;

  const tryRestore = (): void => {
    const el = findElementByKey(anchorKey);

    if (!el) {
      attempts++;
      if (attempts < maxAttempts) {
        RFA(tryRestore);
      } else {
        console.warn(
          `[BidirectionalList] Scroll restore failed: anchor "${anchorKey}" not found`
        );
        isAdjustingRef.value = false;
      }
      return;
    }

    const anchorOffsetAfter =
      el.getBoundingClientRect().top - getViewportTop();
    const delta = anchorOffsetAfter - anchorOffsetBefore;
    if (Math.abs(delta) > 1) {
      setScrollTop(getScrollTop() + delta);
    }
    isAdjustingRef.value = false;
  };

  RFA(tryRestore);
};

/**
 * Handles loading more items in the specified direction.
 * 
 * This is the core infinite scroll logic:
 * - Acquires a lock to prevent concurrent loads
 * - Calls onLoadMore to fetch new items
 * - For up-load: prepends items and restores scroll to prevent jumping
 * - For down-load: appends items (browser handles scroll natively via overflow-anchor)
 * - Trims the list if it exceeds viewSize to maintain performance
 * - Releases lock after cooldown period
 * 
 * @param direction - "up" to load older items, "down" to load newer items
 */
const handleLoad = async (direction: LoadDirection): Promise<void> => {
  // Early exits: disabled, no more items, or already loading this direction
  if (props.disable) return;
  if (direction === "up" && !props.hasPrevious) return;
  if (direction === "down" && !props.hasNext) return;
  if (loadingLockRef[direction]) return;

  const currentItems = itemsRef.value;
  if (currentItems.length === 0) return;

  /** Acquire lock and show spinner */
  loadingLockRef[direction] = true;
  isAdjustingRef.value = true;
  if (direction === "up") isUpLoading.value = true;
  else isDownLoading.value = true;

  try {
    const refItem: T =
      direction === "up"
        ? (currentItems[0] as T)
        : (currentItems[currentItems.length - 1] as T);
    const newItems: T[] = await props.onLoadMore(direction, refItem);

    if (newItems.length === 0) {
      if (direction === "up") isUpLoading.value = false;
      else isDownLoading.value = false;
      isAdjustingRef.value = false;
      return;
    }

    if (direction === "up") {
      /**
       * Anchor = the item that is currently first in the list. It is
       * guaranteed to be in the DOM right now (it was rendered before the
       * await). We snapshot its viewport-relative offset so we can restore
       * scroll after the prepend, because overflow-anchor is unreliable
       * inside iframes (e.g. artifact renderers).
       */
      const anchorKey: string = props.itemKey(currentItems[0] as T);
      const anchorEl: Element | null = findElementByKey(anchorKey);
      const anchorOffsetBefore: number = anchorEl
        ? anchorEl.getBoundingClientRect().top - getViewportTop()
        : 0;

      let nextItems: T[] = [...newItems, ...currentItems] as T[];
      if (nextItems.length > props.viewSize) {
        /**
         * Trim from the bottom (opposite end from prepend).
         * Removed items are below the viewport — no scroll effect.
         */
        nextItems = nextItems.slice(0, props.viewSize);
      }

      /** Commit new items and hide the up-spinner */
      props.onItemsChange?.(nextItems);
      isUpLoading.value = false;

      /**
       * Restore after paint so the prepended + trimmed DOM is measured.
       * The anchor element (old first item) is still in nextItems — it
       * survived the prepend and any bottom-trim — so it will be in the
       * DOM when the mutation fires.
       */
      if (listWrapperRef.value) {
        waitForMutation(listWrapperRef.value, () => {
          restoreScrollToAnchor(anchorKey, anchorOffsetBefore);
        });
      } else {
        isAdjustingRef.value = false;
      }
    } else {
      let nextItems: T[] = [...currentItems, ...newItems] as T[];
      let didTrim: boolean = false;
      let anchorKey: string = "";
      let anchorOffsetBefore: number = 0;

      if (nextItems.length > props.viewSize) {
        const countToRemove: number = nextItems.length - props.viewSize;
        nextItems = nextItems.slice(countToRemove);
        didTrim = true;

        /**
         * Anchor = first survivor after trim. It's in the DOM now (was in
         * currentItems). Down-spinner is below it — safe to measure.
         */
        anchorKey = props.itemKey(nextItems[0] as T);
        const anchorEl: Element | null = findElementByKey(anchorKey);
        if (anchorEl)
          anchorOffsetBefore =
            anchorEl.getBoundingClientRect().top - getViewportTop();
      }

      /** Commit and hide spinner */
      props.onItemsChange?.(nextItems);
      isDownLoading.value = false;

      if (didTrim && listWrapperRef.value) {
        waitForMutation(listWrapperRef.value, () => {
          restoreScrollToAnchor(anchorKey, anchorOffsetBefore);
        });
      } else {
        isAdjustingRef.value = false;
      }
    }
  } catch {
    if (direction === "up") isUpLoading.value = false;
    else isDownLoading.value = false;
    isAdjustingRef.value = false;
  } finally {
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

/**
 * Waits for a DOM mutation on the wrapper element, then runs the callback.
 * Used to ensure Vue has flushed its DOM updates before measuring element positions.
 * Includes a timeout guard to prevent hanging if mutation never fires.
 * 
 * @param wrapper - The element to observe for mutations
 * @param callback - Function to call after mutation is detected
 * @param timeoutMs - Maximum time to wait before giving up (default: 300ms)
 * @returns Cleanup function to stop observing
 */
function waitForMutation(
  wrapper: HTMLDivElement,
  callback: () => void,
  timeoutMs: number = 300
) {
  let settled = false;

  const clean = () => {
    settled = true;
    observer.disconnect();
    clearTimeout(guard);
  };

  const settle = (): void => {
    if (settled) return;
    clean();
    callback();
  };

  const guard = setTimeout(settle, timeoutMs);

  const observer = new MutationObserver(() => {
    settle();
  });

  observer.observe(wrapper, { childList: true, subtree: true });

  return clean;
}
</script>

<!--
  Template Structure:
  
  1. Container (scrollable if !useWindow)
  2. Top sentinel (IntersectionObserver trigger for up-load)
  3. Up-loading spinner (shown while fetching older items)
  4. List wrapper containing all items
  5. Down-loading spinner (shown while fetching newer items)  
  6. Bottom sentinel (IntersectionObserver trigger for down-load)
  7. Empty state (shown when no items and not loading)
  
  Note: Top sentinel has overflow-anchor:none so browser skips it
  and anchors to the first real list item for natural down-scroll.
-->
<template>
  <div ref="scrollViewRef" :style="containerStyles" :class="props.className">
    <div
      ref="topSentinelRef"
      :style="{ height: '1px', marginBottom: '-1px', overflowAnchor: 'none' }"
    />
    <slot v-if="isUpLoading" name="spinner">
      <div :style="{ padding: '20px', textAlign: 'center' }">Loading...</div>
    </slot>
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
    <div ref="bottomSentinelRef" :style="{ height: '4px' }" />
    <slot
      v-if="props.items.length === 0 && !isUpLoading && !isDownLoading"
      name="empty"
    />
  </div>
</template>