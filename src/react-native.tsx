import React, {
  useState,
  useEffect,
  useLayoutEffect,
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
  type ScrollViewProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
  type LayoutChangeEvent,
  Platform,
} from "react-native";

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
  /** get Current distnace to top */
  getTopDistance: () => number;
  /** get Current distnace to bottom */
  getBottomDistance: () => number;
}

export interface BidirectionalListProps<T> {
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
  scrollViewProps?: ScrollViewProps;
}

type Direction = "up" | "down";

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
    scrollViewProps,
  }: BidirectionalListProps<T>,
  ref?: React.Ref<BidirectionalListRef>
) {
  const scrollViewRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const spinnerWrapperRef = useRef<View>(null);
  const mounted = useRef(true);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Item key -> View ref for on-demand measureLayout
  const itemRefs = useRef(new Map<string, View>());

  const loadLock = useRef({ up: false, down: false });
  const isAdjustingRef = useRef(false);

  const [isUpLoading, setIsUpLoading] = useState(false);
  const [isDownLoading, setIsDownLoading] = useState(false);

  const metrics = useRef({
    scrollY: 0,
    contentHeight: 0,
    viewportHeight: 0,
  });

  /**
   * Monotonic counter incremented on every commit that needs scroll restoration.
   * items.length is unreliable — if a load returns the same count as trimmed,
   * the length stays the same and the layout effect won't fire.
   */
  const [commitId, setCommitId] = useState(0);

  // Scroll-restoration state for prepend (up-load)
  const anchorKeyRef = useRef<string | null>(null);
  const spinnerHeightRef = useRef(0);
  const isPrependRef = useRef(false);

  // Scroll-restoration state for down-trim
  const isDownTrimRef = useRef(false);
  const downTrimAnchorKeyRef = useRef<string | null>(null);
  const downTrimAnchorOffsetRef = useRef(0);

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

  // --- Measurement helpers ---

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
      const content = contentRef.current;
      if (!view || !content) return 0;

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

  // --- Scroll helpers ---

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

  const getTopDistance = useCallback(() => {
    const { scrollY } = metrics.current;
    return scrollY;
  }, []);

  const getBottomDistance = useCallback(() => {
    const { contentHeight, viewportHeight, scrollY } = metrics.current;
    return contentHeight - scrollY - viewportHeight;
  }, []);

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
      getTopDistance,
      getBottomDistance,
    }),
    [
      scrollTo,
      scrollToKey,
      scrollToTop,
      scrollToBottom,
      getTopDistance,
      getBottomDistance,
    ]
  );

  const setItemRef = useCallback((key: string, view: View | null) => {
    if (view) itemRefs.current.set(key, view);
    else itemRefs.current.delete(key);
  }, []);

  // --- Scroll restoration (mirrors web version) ---

  /**
   * When the up-spinner renders, measure its height and snapshot the anchor key
   * (first visible item). Runs synchronously after commit, before paint.
   */
  useLayoutEffect(() => {
    if (!isUpLoading) return;

    spinnerHeightRef.current = measureViewHeight(spinnerWrapperRef);

    const currentItems = itemsRef.current;
    if (currentItems.length > 0) {
      anchorKeyRef.current = itemKey(currentItems[0] as T);
    }
  }, [isUpLoading, itemKey, measureViewHeight]);

  /**
   * After items are committed (prepend or down-trim), restore scroll position
   * so the anchor item stays visually pinned.
   *
   * For prepend: new items above the anchor push it down. The spinner was
   * removed, pulling it up by spinnerHeight. Delta = anchorY - spinnerHeight.
   *
   * For down-trim: items removed from top shift the anchor up.
   * Delta = anchorY - previousAnchorOffset.
   */
  useLayoutEffect(() => {
    if (isPrependRef.current) {
      isPrependRef.current = false;

      const anchorKey = anchorKeyRef.current;
      if (anchorKey) {
        const anchorY = measureItemY(anchorKey);
        if (anchorY !== null) {
          const targetScroll = anchorY - spinnerHeightRef.current;
          if (
            Math.abs(targetScroll - metrics.current.scrollY) > MIN_SCROLL_DELTA
          ) {
            setScrollY(targetScroll);
          }
        }
      }

      anchorKeyRef.current = null;
      spinnerHeightRef.current = 0;
      isAdjustingRef.current = false;
      return;
    }

    if (isDownTrimRef.current) {
      isDownTrimRef.current = false;

      const anchorKey = downTrimAnchorKeyRef.current;
      if (anchorKey) {
        const anchorY = measureItemY(anchorKey);
        if (anchorY !== null) {
          const delta = anchorY - downTrimAnchorOffsetRef.current;
          if (Math.abs(delta) > MIN_SCROLL_DELTA) {
            setScrollY(metrics.current.scrollY + delta);
          }
        }
      }

      downTrimAnchorKeyRef.current = null;
      downTrimAnchorOffsetRef.current = 0;
      isAdjustingRef.current = false;
      return;
    }
  }, [commitId, measureItemY, setScrollY]);

  // --- Load handler ---

  const handleLoad = useCallback(
    async (direction: Direction): Promise<void> => {
      if (disable || !mounted.current) return;
      const isUp = direction === "up";

      if (isUp && !hasPrevious) return;
      if (!isUp && !hasNext) return;
      if (loadLock.current[direction]) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      loadLock.current[direction] = true;
      isAdjustingRef.current = true;
      if (isUp) setIsUpLoading(true);
      else setIsDownLoading(true);

      try {
        const refItem: T = isUp
          ? (currentItems[0] as T)
          : (currentItems[currentItems.length - 1] as T);

        const newItems: T[] = await onLoadMore(direction, refItem);

        if (!mounted.current || newItems.length === 0) {
          if (isUp) setIsUpLoading(false);
          else setIsDownLoading(false);
          isAdjustingRef.current = false;
          return;
        }

        if (isUp) {
          let nextItems: T[] = [...newItems, ...currentItems];
          if (nextItems.length > viewCount) {
            nextItems = nextItems.slice(0, viewCount);
          }

          isPrependRef.current = true;
          onItemsChange?.(nextItems);
          setIsUpLoading(false);
          setCommitId((c) => c + 1);
        } else {
          let nextItems: T[] = [...currentItems, ...newItems];
          let didTrim = false;

          if (nextItems.length > viewCount) {
            const countToRemove = nextItems.length - viewCount;
            nextItems = nextItems.slice(countToRemove);
            didTrim = true;

            // Snapshot anchor position before React commits the trim
            const anchorKey = itemKey(nextItems[0] as T);
            const anchorY = measureItemY(anchorKey);
            if (anchorY !== null) {
              downTrimAnchorKeyRef.current = anchorKey;
              downTrimAnchorOffsetRef.current = anchorY;
            }
          }

          if (didTrim) isDownTrimRef.current = true;

          onItemsChange?.(nextItems);
          setIsDownLoading(false);

          if (didTrim) {
            setCommitId((c) => c + 1);
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
      onLoadMore,
      onItemsChange,
      viewCount,
      itemKey,
      measureItemY,
      hasPrevious,
      hasNext,
    ]
  );

  // --- Scroll event ---

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

  // --- Render ---

  const defaultSpinner = (
    <View style={{ padding: 12, alignItems: "center" }}>
      <Text>Loading...</Text>
    </View>
  );
  const spinner = spinnerRow ?? defaultSpinner;

  return (
    <ScrollView
      {...scrollViewProps}
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
