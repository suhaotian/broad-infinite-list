import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from "react";
import {
  View,
  Text,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
  type LayoutChangeEvent,
  Platform,
} from "react-native";
import useNextTick from "use-next-tick";

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

export interface BidirectionalListProps<T> {
  /** Current array of items to display */
  items: T[];
  /** Function to extract a unique key from each item */
  itemKey: (item: T) => string;
  /** Function to render each item */
  renderItem: (item: T) => React.ReactNode;
  /** Called when more items should be loaded; returns the new items to prepend/append */
  onLoadMore: (direction: LoadDirection, refItem: T) => Promise<T[]>;
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
  viewCount?: number;
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
const MIN_SCROLL_DELTA = 1;

function BidirectionalListInner<T>(
  {
    items,
    itemKey,
    renderItem,
    onLoadMore,
    onItemsChange,
    spinnerRow,
    containerStyle,
    listStyle,
    emptyState,
    viewCount = 50,
    threshold = 10,
    hasPrevious,
    hasNext,
    disable,
    onScrollStart,
    onScrollEnd,
  }: BidirectionalListProps<T>,
  ref: React.Ref<BidirectionalListRef>
) {
  const nextTick = useNextTick();

  // DOM refs
  const scrollViewRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const spinnerWrapperRef = useRef<View>(null);
  const mounted = useRef(true);

  // Mutable state that doesn't need re-renders
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Item key -> View ref for on-demand measureLayout
  const itemRefs = useRef(new Map<string, View>());

  const loadLock = useRef<Record<LoadDirection, boolean>>({
    up: false,
    down: false,
  });
  const isAdjustingRef = useRef(false);

  // Pending scroll-restoration info, set before React commits, consumed in nextTick
  const pendingRestoreRef = useRef<{
    type: "prepend" | "down-trim";
    anchor: { key: string; offset: number } | null;
  } | null>(null);

  const [isUpLoading, setIsUpLoading] = useState(false);
  const [isDownLoading, setIsDownLoading] = useState(false);

  const metrics = useRef({
    scrollY: 0,
    contentHeight: 0,
    viewportHeight: 0,
  });

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  // Prune stale item refs
  useEffect(() => {
    if (itemRefs.current.size > items.length + 50) {
      const valid = new Set(items.map(itemKey));
      for (const k of itemRefs.current.keys()) {
        if (!valid.has(k)) itemRefs.current.delete(k);
      }
    }
  }, [items, itemKey]);

  /**
   * Measure an item's Y offset relative to the ScrollView content root.
   * Synchronous on Fabric (New Architecture).
   */
  const measureItemY = useCallback((key: string): number | null => {
    const itemView = itemRefs.current.get(key);
    const content = contentRef.current;
    if (!itemView || !content) return null;

    let result: number | null = null;
    try {
      itemView.measureLayout(
        content,
        (_x, y) => {
          result = y;
        },
        () => {}
      );
    } catch {
      // measureLayout may throw if views are not mounted
    }
    return result;
  }, []);

  const measureViewHeight = useCallback(
    (viewRef: React.RefObject<View | null>): number => {
      const view = viewRef.current;
      if (!view) return 0;

      let result = 0;
      try {
        view.measure((_x, _y, _w, h) => {
          result = h;
        });
      } catch {
        // may throw if not mounted
      }
      return result;
    },
    []
  );

  const scrollTo = useCallback((y: number, animated = true) => {
    scrollViewRef.current?.scrollTo({ y: Math.max(0, y), animated });
  }, []);

  const setScrollY = useCallback(
    (value: number): void => {
      onScrollStart?.();
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, value),
        animated: false,
      });
      metrics.current.scrollY = value;
      onScrollEnd?.();
    },
    [onScrollStart, onScrollEnd]
  );

  const scrollToTop = useCallback(
    (animated = true) => scrollTo(0, animated),
    [scrollTo]
  );

  const scrollToBottom = useCallback(
    (animated = true) => {
      const { contentHeight, viewportHeight } = metrics.current;
      scrollTo(Math.max(0, contentHeight - viewportHeight), animated);
    },
    [scrollTo]
  );

  const scrollToKey = useCallback(
    (key: string, animated = true) => {
      const y = measureItemY(key);
      if (y !== null) scrollTo(y, animated);
    },
    [scrollTo, measureItemY]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollViewRef,
      scrollTo,
      scrollToKey,
      scrollToTop,
      scrollToBottom,
    }),
    [scrollTo, scrollToKey, scrollToTop, scrollToBottom]
  );

  const setItemRef = useCallback((key: string, view: View | null) => {
    if (view) itemRefs.current.set(key, view);
    else itemRefs.current.delete(key);
  }, []);

  const applyScrollRestore = useCallback(() => {
    const pending = pendingRestoreRef.current;
    if (!pending) {
      isAdjustingRef.current = false;
      return;
    }
    pendingRestoreRef.current = null;

    if (pending.type === "prepend") {
      const anchorKey = pending.anchor?.key;
      if (anchorKey) {
        const anchorY = measureItemY(anchorKey);
        if (anchorY !== null) {
          const targetScroll = anchorY - (pending.anchor?.offset ?? 0);
          if (
            Math.abs(targetScroll - metrics.current.scrollY) > MIN_SCROLL_DELTA
          ) {
            setScrollY(targetScroll);
          }
        }
      }
    } else if (pending.type === "down-trim") {
      if (pending.anchor) {
        const anchorY = measureItemY(pending.anchor.key);
        if (anchorY !== null) {
          const delta = anchorY - pending.anchor.offset;
          if (Math.abs(delta) > MIN_SCROLL_DELTA) {
            setScrollY(metrics.current.scrollY + delta);
          }
        }
      }
    }

    isAdjustingRef.current = false;
  }, [measureItemY, setScrollY]);

  const handleLoad = useCallback(
    async (direction: LoadDirection): Promise<void> => {
      if (disable || !mounted.current) return;
      const isUp = direction === "up";

      if (isUp && !hasPrevious) return;
      if (!isUp && !hasNext) return;
      if (loadLock.current[direction]) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      loadLock.current[direction] = true;
      isAdjustingRef.current = true;

      if (isUp) {
        setIsUpLoading(true);
        // Wait for spinner to render so we can measure it as the anchor offset.
        // The first visible item sits below the spinner, so its visual offset
        // equals the spinner height.
        nextTick(() => {
          const spinnerHeight = measureViewHeight(spinnerWrapperRef);
          const firstKey =
            itemsRef.current.length > 0
              ? itemKey(itemsRef.current[0] as T)
              : null;
          if (firstKey) {
            // For prepend, the anchor's "previous offset" is the spinner height
            // because the anchor sat directly below the spinner before new items appeared.
            pendingRestoreRef.current = {
              type: "prepend",
              anchor: { key: firstKey, offset: spinnerHeight },
            };
          }
        });
      } else {
        setIsDownLoading(true);
      }

      try {
        const refItem: T = isUp
          ? (currentItems[0] as T)
          : (currentItems[currentItems.length - 1] as T);

        const newItems = await onLoadMore(direction, refItem);

        if (!mounted.current || newItems.length === 0) {
          if (isUp) setIsUpLoading(false);
          else setIsDownLoading(false);
          isAdjustingRef.current = false;
          return;
        }

        if (isUp) {
          let nextItems = [...newItems, ...currentItems];
          if (nextItems.length > viewCount) {
            nextItems = nextItems.slice(0, viewCount);
          }

          onItemsChange?.(nextItems);
          setIsUpLoading(false);
          nextTick(applyScrollRestore);
        } else {
          let nextItems = [...currentItems, ...newItems];
          let didTrim = false;

          if (nextItems.length > viewCount) {
            const countToRemove = nextItems.length - viewCount;
            nextItems = nextItems.slice(countToRemove);
            didTrim = true;

            // Snapshot anchor position before React commits the trim
            const anchorKey = itemKey(nextItems[0] as T);
            const anchorY = measureItemY(anchorKey);
            if (anchorY !== null) {
              pendingRestoreRef.current = {
                type: "down-trim",
                anchor: { key: anchorKey, offset: anchorY },
              };
            }
          }

          onItemsChange?.(nextItems);
          setIsDownLoading(false);

          if (didTrim) {
            nextTick(applyScrollRestore);
          } else {
            isAdjustingRef.current = false;
          }
        }
      } catch (err) {
        console.error("[BidirectionalList] Load error:", err);
        if (isUp) setIsUpLoading(false);
        else setIsDownLoading(false);
        isAdjustingRef.current = false;
      } finally {
        setTimeout(() => {
          if (mounted.current) {
            loadLock.current[direction] = false;
          }
        }, LOAD_COOLDOWN_MS);
      }
    },
    [
      disable,
      hasPrevious,
      hasNext,
      onLoadMore,
      onItemsChange,
      viewCount,
      itemKey,
      measureItemY,
      measureViewHeight,
      nextTick,
      applyScrollRestore,
    ]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;

      metrics.current = {
        scrollY: contentOffset.y,
        contentHeight: contentSize.height,
        viewportHeight: layoutMeasurement.height,
      };

      if (isAdjustingRef.current) return;

      const fromTop = contentOffset.y;
      const fromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      if (fromTop < threshold && hasPrevious && !isUpLoading) {
        handleLoad("up");
      }
      if (fromBottom < threshold && hasNext && !isDownLoading) {
        handleLoad("down");
      }
    },
    [threshold, hasPrevious, hasNext, isUpLoading, isDownLoading, handleLoad]
  );

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    metrics.current.contentHeight = h;
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    metrics.current.viewportHeight = e.nativeEvent.layout.height;
  }, []);

  const defaultSpinner = (
    <View style={{ padding: 12, alignItems: "center" }}>
      <Text>Loading...</Text>
    </View>
  );
  const spinner = spinnerRow ?? defaultSpinner;

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[{ flex: 1 }, containerStyle]}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleLayout}
      {...(Platform.OS === "ios" && {
        maintainVisibleContentPosition: {
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        },
      })}>
      <View ref={contentRef} collapsable={false}>
        {isUpLoading && (
          <View ref={spinnerWrapperRef} collapsable={false}>
            {spinner}
          </View>
        )}

        <View style={listStyle}>
          {items.map((item) => {
            const key = itemKey(item);
            return (
              <View
                key={key}
                ref={(v) => setItemRef(key, v)}
                collapsable={false}>
                {renderItem(item)}
              </View>
            );
          })}
        </View>

        {isDownLoading && spinner}

        {items.length === 0 && !isUpLoading && !isDownLoading && emptyState}
      </View>
    </ScrollView>
  );
}

const BidirectionalList = forwardRef(BidirectionalListInner) as <T>(
  props: BidirectionalListProps<T> & { ref?: React.Ref<BidirectionalListRef> }
) => React.ReactElement;

export default BidirectionalList;
