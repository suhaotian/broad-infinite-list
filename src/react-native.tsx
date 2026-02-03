import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type RefObject,
  memo,
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

type Direction = "up" | "down";

interface ItemLayout {
  y: number;
  height: number;
}

interface RestorationContext {
  direction: Direction;
  anchorKey: string;
  anchorViewportOffset: number;
}

const LOAD_COOLDOWN_MS = 150;

const ItemWrapper = memo(function ItemWrapper({
  itemKey,
  onLayout,
  children,
}: {
  itemKey: string;
  onLayout: (key: string, layout: ItemLayout) => void;
  children: React.ReactNode;
}) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height } = e.nativeEvent.layout;
      onLayout(itemKey, { y, height });
    },
    [itemKey, onLayout]
  );
  return <View onLayout={handleLayout}>{children}</View>;
});

// ============================================================================
// Main Component
// ============================================================================

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
    viewSize = 30,
    threshold = 200,
    hasPrevious,
    hasNext,
    disable,
    onScrollStart,
    onScrollEnd,
  }: BidirectionalListProps<T>,
  ref: React.Ref<BidirectionalListRef>
) {
  const scrollViewRef = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const itemsRef = useRef(items);

  const loadLock = useRef({ up: false, down: false });
  const [loadingUp, setLoadingUp] = useState(false);
  const [loadingDown, setLoadingDown] = useState(false);

  const metrics = useRef({
    scrollY: 0,
    contentHeight: 0,
    viewportHeight: 0,
  });

  const layouts = useRef(new Map<string, ItemLayout>());
  const listViewOffset = useRef(0);

  const pendingRestore = useRef<RestorationContext | null>(null);
  const suppressTriggers = useRef(false);

  // Track if we're in the middle of a restoration cycle
  const isRestoring = useRef(false);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (layouts.current.size > items.length + 50) {
      const valid = new Set(items.map(itemKey));
      for (const k of layouts.current.keys()) {
        if (!valid.has(k)) layouts.current.delete(k);
      }
    }
  }, [items, itemKey]);

  // -------------------------------------------------------------------------
  // Scroll Methods
  // -------------------------------------------------------------------------

  const scrollTo = useCallback((y: number, animated = true) => {
    scrollViewRef.current?.scrollTo({ y: Math.max(0, y), animated });
  }, []);

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
      const layout = layouts.current.get(key);
      if (layout) {
        scrollTo(layout.y + listViewOffset.current, animated);
      }
    },
    [scrollTo]
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

  // -------------------------------------------------------------------------
  // Layout Tracking
  // -------------------------------------------------------------------------

  const handleItemLayout = useCallback((key: string, layout: ItemLayout) => {
    layouts.current.set(key, layout);
  }, []);

  const handleListViewLayout = useCallback((e: LayoutChangeEvent) => {
    const newOffset = e.nativeEvent.layout.y;
    listViewOffset.current = newOffset;

    // If we have a pending restore and listView offset just changed,
    // this might be because spinner appeared/disappeared
    // Try restoration immediately
    if (pendingRestore.current && !isRestoring.current) {
      isRestoring.current = true;
      // Execute on next microtask to let other layouts settle
      Promise.resolve().then(() => {
        executeRestoration();
      });
    }
  }, []);

  const getItemAbsoluteY = useCallback((key: string): number | null => {
    const layout = layouts.current.get(key);
    if (!layout) return null;
    return layout.y + listViewOffset.current;
  }, []);

  // -------------------------------------------------------------------------
  // Restoration
  // -------------------------------------------------------------------------

  const executeRestoration = useCallback(() => {
    const ctx = pendingRestore.current;
    if (!ctx) {
      isRestoring.current = false;
      return;
    }

    const absoluteY = getItemAbsoluteY(ctx.anchorKey);
    if (absoluteY === null) {
      // Anchor not measured yet, wait for next layout
      isRestoring.current = false;
      return;
    }

    const currentAnchorViewportOffset = absoluteY - metrics.current.scrollY;
    const scrollAdjustment =
      currentAnchorViewportOffset - ctx.anchorViewportOffset;
    const targetScrollY = metrics.current.scrollY + scrollAdjustment;

    // Clear pending restore BEFORE scrolling to prevent re-entry
    pendingRestore.current = null;

    if (Math.abs(scrollAdjustment) > 1) {
      onScrollStart?.();

      scrollViewRef.current?.scrollTo({
        y: Math.max(0, targetScrollY),
        animated: false,
      });

      metrics.current.scrollY = targetScrollY;

      // Small delay before re-enabling triggers
      setTimeout(() => {
        if (mounted.current) {
          suppressTriggers.current = false;
          isRestoring.current = false;
          onScrollEnd?.();
        }
      }, 16);
    } else {
      suppressTriggers.current = false;
      isRestoring.current = false;
    }
  }, [onScrollStart, onScrollEnd, getItemAbsoluteY]);

  // -------------------------------------------------------------------------
  // Load Handler
  // -------------------------------------------------------------------------

  const handleLoad = useCallback(
    async (direction: Direction): Promise<void> => {
      if (disable || !mounted.current) return;
      if (direction === "up" && !hasPrevious) return;
      if (direction === "down" && !hasNext) return;
      if (loadLock.current[direction]) return;
      if (suppressTriggers.current) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      loadLock.current[direction] = true;

      // Show spinner
      if (direction === "up") setLoadingUp(true);
      else setLoadingDown(true);

      try {
        const refItem =
          direction === "up"
            ? currentItems[0]!
            : currentItems[currentItems.length - 1]!;

        const newItems = await onLoadMore(direction, refItem);

        if (!mounted.current || newItems.length === 0) {
          if (direction === "up") setLoadingUp(false);
          else setLoadingDown(false);
          return;
        }

        // Determine anchor item
        let anchorItem: T;
        if (direction === "up") {
          anchorItem = currentItems[0]!;
        } else {
          const combined = [...currentItems, ...newItems];
          const trimCount = Math.max(0, combined.length - viewSize);
          anchorItem = combined[trimCount] ?? currentItems[0]!;
        }

        const anchorKey = itemKey(anchorItem);
        const absoluteY = getItemAbsoluteY(anchorKey);

        if (absoluteY !== null) {
          const anchorViewportOffset = absoluteY - metrics.current.scrollY;

          pendingRestore.current = {
            direction,
            anchorKey,
            anchorViewportOffset,
          };
          suppressTriggers.current = true;
        }

        // Calculate new items
        let nextItems: T[];
        if (direction === "up") {
          nextItems = [...newItems, ...currentItems];
          if (nextItems.length > viewSize) {
            nextItems = nextItems.slice(0, viewSize);
          }
        } else {
          nextItems = [...currentItems, ...newItems];
          if (nextItems.length > viewSize) {
            const trim = nextItems.length - viewSize;
            nextItems = nextItems.slice(trim);
          }
        }

        // Update items and hide spinner
        onItemsChange?.(nextItems);
        if (direction === "up") setLoadingUp(false);
        else setLoadingDown(false);
      } catch (err) {
        console.error("[BidirectionalList] Load error:", err);
        pendingRestore.current = null;
        suppressTriggers.current = false;
        if (direction === "up") setLoadingUp(false);
        else setLoadingDown(false);
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
      viewSize,
      itemKey,
      getItemAbsoluteY,
    ]
  );

  // -------------------------------------------------------------------------
  // ScrollView Handlers
  // -------------------------------------------------------------------------

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;

      metrics.current = {
        scrollY: contentOffset.y,
        contentHeight: contentSize.height,
        viewportHeight: layoutMeasurement.height,
      };

      if (suppressTriggers.current) return;

      const fromTop = contentOffset.y;
      const fromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      if (fromTop < threshold && hasPrevious && !loadingUp) {
        handleLoad("up");
      }

      if (fromBottom < threshold && hasNext && !loadingDown) {
        handleLoad("down");
      }
    },
    [threshold, hasPrevious, hasNext, loadingUp, loadingDown, handleLoad]
  );

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const prev = metrics.current.contentHeight;
      metrics.current.contentHeight = h;

      // If content size changed and we have pending restore, execute it
      if (
        pendingRestore.current &&
        Math.abs(h - prev) > 1 &&
        !isRestoring.current
      ) {
        isRestoring.current = true;
        // Use microtask for faster execution than RAF
        Promise.resolve().then(() => {
          executeRestoration();
        });
      }
    },
    [executeRestoration]
  );

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    metrics.current.viewportHeight = e.nativeEvent.layout.height;
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
      {loadingUp && spinner}

      <View style={listStyle} onLayout={handleListViewLayout}>
        {items.map((item) => {
          const key = itemKey(item);
          return (
            <ItemWrapper key={key} itemKey={key} onLayout={handleItemLayout}>
              {renderItem(item)}
            </ItemWrapper>
          );
        })}
      </View>

      {loadingDown && spinner}

      {items.length === 0 && !loadingUp && !loadingDown && emptyState}
    </ScrollView>
  );
}

const BidirectionalList = forwardRef(BidirectionalListInner) as <T>(
  props: BidirectionalListProps<T> & { ref?: React.Ref<BidirectionalListRef> }
) => React.ReactElement;

export default BidirectionalList;
