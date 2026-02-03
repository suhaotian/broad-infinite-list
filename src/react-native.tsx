import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  type ForwardedRef,
  type RefObject,
} from "react";
import {
  View,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
  type LayoutChangeEvent,
} from "react-native";

/**
 * React Native implementation of BidirectionalList.
 *
 * Key differences from the web version:
 *
 * 1. SCROLL CONTAINER: Uses ScrollView instead of overflow:auto divs
 * 2. LOAD DETECTION: Uses onScroll events with threshold math instead of
 *    IntersectionObserver with sentinel elements
 * 3. LAYOUT TRACKING: Uses onLayout callbacks to build a Map of item positions
 *    instead of getBoundingClientRect() for synchronous measurements
 * 4. SCROLL RESTORATION: ScrollView lacks overflow-anchor, so we manually
 *    restore scroll for both up-loads and down-loads with trim
 * 5. TIMING: Polls for layout availability with requestAnimationFrame retry
 *    instead of MutationObserver with guaranteed DOM sync
 */

export interface BidirectionalListRef {
  /** Reference to the scrollable ScrollView */
  scrollViewRef: RefObject<ScrollView | null>;
  /** Scroll to the top of the list */
  scrollToTop: (animated?: boolean) => void;
  /** Scroll to the bottom of the list */
  scrollToBottom: (animated?: boolean) => void;
  /** Scroll to a specific pixel offset from top */
  scrollTo: (y: number, animated?: boolean) => void;
  /** Scroll to an item by its key */
  scrollToKey: (key: string, animated?: boolean) => void;
}

export default interface BidirectionalListProps<T> {
  /** Current array of items to display */
  items: T[];
  /** Function to extract a unique key from each item */
  itemKey: (item: T) => string;
  /** Function to render each item */
  renderItem: (item: T) => React.ReactNode;
  /** Called when more items should be loaded; returns the new items to prepend/append */
  onLoadMore: (direction: "up" | "down", refItem: T) => Promise<T[]>;
  /** Called when the items array changes due to loading or trimming */
  onItemsChange?: (items: T[]) => void;
  /** The container ScrollView's style */
  containerStyle?: ViewStyle;
  /** The list wrapper View's style */
  listStyle?: ViewStyle;
  /** Custom loading indicator shown during fetch */
  spinnerRow?: React.ReactNode;
  /** Content to display when items array is empty */
  emptyState?: React.ReactNode;
  /** Maximum number of items to keep in DOM; older items are trimmed */
  viewSize?: number;
  /** Pixel distance from edge to trigger loading */
  threshold?: number;
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
}

export type LoadDirection = "up" | "down";

const LOAD_COOLDOWN_MS = 150;

export function BidirectionalList<T>({
  items,
  itemKey,
  renderItem,
  onLoadMore,
  onItemsChange,
  spinnerRow = (
    <View style={{ padding: 20, alignItems: "center" }}>
      <View>Loading...</View>
    </View>
  ),
  containerStyle,
  listStyle,
  emptyState,
  viewSize = 30,
  threshold = 200,
  hasPrevious,
  hasNext,
  ref,
  disable,
  onScrollStart,
  onScrollEnd,
}: BidirectionalListProps<T> & {
  ref?: ForwardedRef<BidirectionalListRef>;
}) {
  const scrollViewRef = useRef<ScrollView>(null);
  const loadingLockRef = useRef<Record<LoadDirection, boolean>>({
    up: false,
    down: false,
  });
  const [isUpLoading, setIsUpLoading] = useState<boolean>(false);
  const [isDownLoading, setIsDownLoading] = useState<boolean>(false);
  const isAdjustingRef = useRef<boolean>(false);
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;

  /** Scroll metrics tracked on every scroll event */
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    layoutHeight: 0,
    offsetY: 0,
  });

  /** Item layout measurements: key -> { y, height } */
  const itemLayoutsRef = useRef<Map<string, { y: number; height: number }>>(
    new Map()
  );

  /** Pending scroll restoration after up-load */
  const scrollRestoreRef = useRef<{
    anchorKey: string;
    anchorY: number;
  } | null>(null);

  const scrollTo = useCallback((y: number, animated: boolean = true) => {
    scrollViewRef.current?.scrollTo({ y, animated });
  }, []);

  useImperativeHandle(ref, () => ({
    scrollViewRef,
    scrollTo,
    scrollToKey(key, animated = true) {
      const layout = itemLayoutsRef.current.get(key);
      if (layout) {
        scrollTo(layout.y, animated);
      }
    },
    scrollToTop(animated = true) {
      scrollTo(0, animated);
    },
    scrollToBottom(animated = true) {
      const { contentHeight, layoutHeight } = scrollMetricsRef.current;
      const maxY = Math.max(0, contentHeight - layoutHeight);
      scrollTo(maxY, animated);
    },
  }));

  /**
   * Tracks the layout of each item so we can restore scroll after loading.
   * Called when each item's onLayout event fires.
   * Unlike the web version's overflow-anchor, ScrollView doesn't automatically
   * maintain scroll position during prepends, so we track all item positions.
   */
  const handleItemLayout = useCallback(
    (key: string, event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      itemLayoutsRef.current.set(key, { y, height });
    },
    []
  );

  const handleLoad = useCallback(
    async (direction: LoadDirection): Promise<void> => {
      if (disable) return;
      if (direction === "up" && !hasPrevious) return;
      if (direction === "down" && !hasNext) return;
      if (loadingLockRef.current[direction]) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      /** Acquire lock and show spinner. */
      loadingLockRef.current[direction] = true;
      isAdjustingRef.current = true;
      if (direction === "up") setIsUpLoading(true);
      else setIsDownLoading(true);

      try {
        const refItem: T =
          direction === "up"
            ? (currentItems[0] as T)
            : (currentItems[currentItems.length - 1] as T);
        const newItems: T[] = await onLoadMore(direction, refItem);

        if (newItems.length === 0) {
          if (direction === "up") setIsUpLoading(false);
          else setIsDownLoading(false);
          isAdjustingRef.current = false;
          return;
        }

        if (direction === "up") {
          /**
           * Anchor = the item that is currently first in the list.
           * Snapshot its Y position so we can restore scroll after the prepend.
           */
          const anchorKey: string = itemKey(currentItems[0] as T);
          const anchorLayout = itemLayoutsRef.current.get(anchorKey);
          const anchorYBefore: number = anchorLayout?.y ?? 0;

          let nextItems: T[] = [...newItems, ...currentItems];
          if (nextItems.length > viewSize) {
            /**
             * Trim from the bottom (opposite end from prepend).
             * Removed items are below the viewport — no scroll effect.
             */
            nextItems = nextItems.slice(0, viewSize);
          }

          /** Store restore info before committing new items. */
          scrollRestoreRef.current = { anchorKey, anchorY: anchorYBefore };

          /** Commit new items and hide the up-spinner. */
          onItemsChange?.(nextItems);
          setIsUpLoading(false);

          /**
           * Restoration happens in useEffect when scrollRestoreRef is set.
           * We must wait for all new item layouts to be measured.
           */
        } else {
          let nextItems: T[] = [...currentItems, ...newItems];
          let didTrim: boolean = false;
          let anchorKey: string = "";
          let anchorYBefore: number = 0;

          if (nextItems.length > viewSize) {
            const countToRemove: number = nextItems.length - viewSize;
            nextItems = nextItems.slice(countToRemove);
            didTrim = true;

            /**
             * Anchor = first survivor after trim. It's in the layout map now
             * (was in currentItems).
             */
            anchorKey = itemKey(nextItems[0] as T);
            const anchorLayout = itemLayoutsRef.current.get(anchorKey);
            if (anchorLayout) anchorYBefore = anchorLayout.y;
          }

          /** Store restore info before committing. */
          if (didTrim) {
            scrollRestoreRef.current = { anchorKey, anchorY: anchorYBefore };
          }

          /** Commit and hide spinner. */
          onItemsChange?.(nextItems);
          setIsDownLoading(false);

          /**
           * If we didn't trim, no scroll adjustment needed.
           */
          if (!didTrim) {
            isAdjustingRef.current = false;
          }
        }
      } catch {
        if (direction === "up") setIsUpLoading(false);
        else setIsDownLoading(false);
        isAdjustingRef.current = false;
      } finally {
        setTimeout(() => {
          loadingLockRef.current[direction] = false;
        }, LOAD_COOLDOWN_MS);
      }
    },
    [
      disable,
      onLoadMore,
      onItemsChange,
      viewSize,
      itemKey,
      hasPrevious,
      hasNext,
    ]
  );

  /**
   * When scrollRestoreRef is set, wait for the anchor's layout to be measured,
   * then restore scroll position. Retries if layout isn't ready yet.
   */
  useEffect(() => {
    if (!scrollRestoreRef.current) return;
    const { anchorKey, anchorY } = scrollRestoreRef.current;
    scrollRestoreRef.current = null;

    /**
     * In React Native, onLayout events fire asynchronously after render.
     * We poll for the layout to be available, with a retry limit.
     */
    let attempts = 0;
    const maxAttempts = 10;

    const tryRestore = (): void => {
      const layout = itemLayoutsRef.current.get(anchorKey);
      if (!layout) {
        attempts++;
        if (attempts < maxAttempts) {
          requestAnimationFrame(tryRestore);
        } else {
          console.warn(
            `[BidirectionalList] Scroll restore failed: anchor "${anchorKey}" layout not measured after ${maxAttempts} attempts`
          );
          isAdjustingRef.current = false;
        }
        return;
      }

      const anchorYAfter = layout.y;
      const delta = anchorYAfter - anchorY;
      if (Math.abs(delta) > 1) {
        const currentOffsetY = scrollMetricsRef.current.offsetY;
        const newOffsetY = currentOffsetY + delta;
        onScrollStart?.();
        scrollViewRef.current?.scrollTo({ y: newOffsetY, animated: false });
        scrollMetricsRef.current.offsetY = newOffsetY;
        onScrollEnd?.();
      }
      isAdjustingRef.current = false;
    };

    requestAnimationFrame(tryRestore);
  }, [items, onScrollStart, onScrollEnd]);

  /**
   * Tracks scroll position and triggers loading when near edges.
   */
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isAdjustingRef.current) return;

      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      scrollMetricsRef.current = {
        contentHeight: contentSize.height,
        layoutHeight: layoutMeasurement.height,
        offsetY: contentOffset.y,
      };

      const scrollTop = contentOffset.y;
      const scrollBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      if (scrollTop < threshold && hasPrevious && !isUpLoading) {
        handleLoad("up");
      }
      if (scrollBottom < threshold && hasNext && !isDownLoading) {
        handleLoad("down");
      }
    },
    [threshold, handleLoad, hasPrevious, hasNext, isUpLoading, isDownLoading]
  );

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[{ flex: 1 }, containerStyle]}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={true}>
      {isUpLoading && spinnerRow}
      <View style={listStyle}>
        {items.map((item: T) => {
          const key = itemKey(item);
          return (
            <View key={key} onLayout={(event) => handleItemLayout(key, event)}>
              {renderItem(item)}
            </View>
          );
        })}
      </View>
      {isDownLoading && spinnerRow}
      {items.length === 0 && !isUpLoading && !isDownLoading && emptyState}
    </ScrollView>
  );
}

