import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  type ForwardedRef,
  type RefObject,
} from "react";

export interface BidirectionalListRef {
  /** Reference to the scrollable container element */
  scrollViewRef: RefObject<HTMLElement | null>;
  /** Scroll to the top of the list */
  scrollToTop: (behavior?: ScrollBehavior) => void;
  /** Scroll to the bottom of the list */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Scroll to a specific pixel offset from top */
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  /** Scroll to an item by its key */
  scrollToKey: (key: string, behavior?: ScrollBehavior) => void;
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
  /** The container div's className */
  className?: string;
  /** The list wrapper div's className */
  listClassName?: string;
  /** Custom loading indicator shown during fetch */
  spinnerRow?: React.ReactNode;
  /** Content to display when items array is empty */
  emptyState?: React.ReactNode;
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
}

export type LoadDirection = "up" | "down";

const LOAD_COOLDOWN_MS = 150;
const MIN_SCROLL_DELTA = 1;
const getRootEl = () => document.documentElement;

/**
 * Compute scroll delta needed to keep an anchor element at its previous
 * visual position. Returns 0 if anchor not found or delta is negligible.
 */
function computeAnchorDelta(
  anchorKey: string | null,
  previousOffset: number,
  findElementByKey: (key: string) => Element | null,
  getViewportTop: () => number
): number {
  if (!anchorKey) return 0;
  const el = findElementByKey(anchorKey);
  if (!el) return 0;
  const currentOffset = el.getBoundingClientRect().top - getViewportTop();
  const delta = currentOffset - previousOffset;
  return Math.abs(delta) > MIN_SCROLL_DELTA ? delta : 0;
}

export default function BidirectionalList<T>({
  items,
  itemKey,
  renderItem,
  onLoadMore,
  onItemsChange,
  spinnerRow = (
    <div style={{ padding: 20, textAlign: "center" }}>Loading...</div>
  ),
  className,
  listClassName,
  emptyState,
  viewCount = 50,
  threshold = 10,
  useWindow = false,
  hasPrevious,
  hasNext,
  ref,
  disable,
  onScrollStart,
  onScrollEnd,
}: BidirectionalListProps<T> & {
  ref?: ForwardedRef<BidirectionalListRef>;
}) {
  const scrollViewRef = useRef<HTMLDivElement>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const spinnerWrapperRef = useRef<HTMLDivElement>(null);

  const loadingLockRef = useRef<Record<LoadDirection, boolean>>({
    up: false,
    down: false,
  });

  const isAdjustingRef = useRef(false);
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;

  /**
   * Monotonic counter incremented on every commit that needs scroll restoration.
   * items.length is unreliable — if a load returns the same count as trimmed,
   * the length stays the same and the layout effect won't fire.
   */
  const [commitId, setCommitId] = useState(0);

  // Scroll-restoration state for prepend (up-load)
  const anchorKeyRef = useRef<string | null>(null);
  const spinnerHeightRef = useRef<number>(0);
  const isPrependRef = useRef(false);

  // Scroll-restoration state for down-trim
  const isDownTrimRef = useRef(false);
  const downTrimAnchorKeyRef = useRef<string | null>(null);
  const downTrimAnchorOffsetRef = useRef<number>(0);

  const [isUpLoading, setIsUpLoading] = useState(false);
  const [isDownLoading, setIsDownLoading] = useState(false);

  const scrollTo = useCallback(
    (top: number, behavior: ScrollBehavior = "smooth") => {
      if (useWindow) getRootEl().scrollTo({ top, behavior });
      else scrollViewRef.current?.scrollTo({ top, behavior });
    },
    [useWindow]
  );

  const getScrollTop = useCallback((): number => {
    if (useWindow) return window.scrollY || getRootEl().scrollTop;
    return scrollViewRef.current?.scrollTop ?? 0;
  }, [useWindow]);

  const setScrollTop = useCallback(
    (value: number): void => {
      onScrollStart?.();
      if (useWindow) getRootEl().scrollTop = value;
      else if (scrollViewRef.current) scrollViewRef.current.scrollTop = value;
      onScrollEnd?.();
    },
    [useWindow, onScrollStart, onScrollEnd]
  );

  const getViewportTop = useCallback((): number => {
    if (useWindow) return 0;
    return scrollViewRef.current?.getBoundingClientRect().top ?? 0;
  }, [useWindow]);

  const findElementByKey = useCallback(
    (key: string): Element | null => {
      const container = useWindow ? getRootEl() : scrollViewRef.current;
      if (!container) return null;
      return container.querySelector(`[data-item-key="${key}"]`);
    },
    [useWindow]
  );

  useImperativeHandle(ref, () => ({
    scrollViewRef: useWindow
      ? ({ current: getRootEl() } as RefObject<HTMLElement>)
      : scrollViewRef,
    scrollTo,
    scrollToKey(key, behavior) {
      const el = findElementByKey(key);
      if (el) el.scrollIntoView({ behavior, block: "start" });
    },
    scrollToTop(behavior) {
      scrollTo(0, behavior);
    },
    scrollToBottom(behavior) {
      const container = useWindow ? getRootEl() : scrollViewRef.current;
      if (container) scrollTo(container.scrollHeight, behavior);
    },
  }));

  /**
   * When the up-spinner renders, measure its height and snapshot the anchor key
   * (first visible item). Runs synchronously after DOM insert, before paint.
   */
  useLayoutEffect(() => {
    if (!isUpLoading) return;

    if (spinnerWrapperRef.current) {
      spinnerHeightRef.current =
        spinnerWrapperRef.current.getBoundingClientRect().height;
    }

    const currentItems = itemsRef.current;
    if (currentItems.length > 0) {
      anchorKeyRef.current = itemKey(currentItems[0] as T);
    }
  }, [isUpLoading, itemKey]);

  /**
   * After items are committed (prepend or down-trim), restore scroll position
   * so the anchor item stays visually pinned.
   *
   * Both cases share the same pattern: find anchor element, compute delta,
   * apply scroll correction, reset refs.
   */
  useLayoutEffect(() => {
    if (isPrependRef.current) {
      isPrependRef.current = false;

      // For prepend: the previous offset is the spinner height (anchor was
      // visually that far below the scroll position before the commit).
      const delta = computeAnchorDelta(
        anchorKeyRef.current,
        spinnerHeightRef.current,
        findElementByKey,
        getViewportTop
      );
      if (delta !== 0) setScrollTop(getScrollTop() + delta);

      anchorKeyRef.current = null;
      spinnerHeightRef.current = 0;
      isAdjustingRef.current = false;
      return;
    }

    if (isDownTrimRef.current) {
      isDownTrimRef.current = false;

      const delta = computeAnchorDelta(
        downTrimAnchorKeyRef.current,
        downTrimAnchorOffsetRef.current,
        findElementByKey,
        getViewportTop
      );
      if (delta !== 0) setScrollTop(getScrollTop() + delta);

      downTrimAnchorKeyRef.current = null;
      downTrimAnchorOffsetRef.current = 0;
      isAdjustingRef.current = false;
      return;
    }
  }, [commitId, findElementByKey, getViewportTop, getScrollTop, setScrollTop]);

  const handleLoad = useCallback(
    async (direction: LoadDirection): Promise<void> => {
      if (disable) return;
      const isUp = direction === "up";

      if (isUp && !hasPrevious) return;
      if (!isUp && !hasNext) return;
      if (loadingLockRef.current[direction]) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      loadingLockRef.current[direction] = true;
      isAdjustingRef.current = true;
      if (isUp) setIsUpLoading(true);
      else setIsDownLoading(true);

      try {
        const refItem: T = isUp
          ? (currentItems[0] as T)
          : (currentItems[currentItems.length - 1] as T);

        const newItems: T[] = await onLoadMore(direction, refItem);

        if (newItems.length === 0) {
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
            const anchorEl = findElementByKey(anchorKey);
            if (anchorEl) {
              downTrimAnchorKeyRef.current = anchorKey;
              downTrimAnchorOffsetRef.current =
                anchorEl.getBoundingClientRect().top - getViewportTop();
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
      } catch {
        if (isUp) setIsUpLoading(false);
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
      viewCount,
      itemKey,
      findElementByKey,
      getViewportTop,
      hasPrevious,
      hasNext,
    ]
  );

  useEffect(() => {
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (!top || !bottom || disable) return;
    if (!hasNext && !hasPrevious) return;

    const root: HTMLDivElement | null = useWindow
      ? null
      : scrollViewRef.current;

    const obs = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        if (isAdjustingRef.current) return;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === top) handleLoad("up");
          else if (e.target === bottom) handleLoad("down");
        }
      },
      {
        root,
        rootMargin: `${threshold}px 0px ${threshold}px 0px`,
        threshold: 0,
      }
    );

    obs.observe(top);
    obs.observe(bottom);
    return () => obs.disconnect();
  }, [threshold, handleLoad, useWindow, disable, hasNext, hasPrevious]);

  const containerStyles: React.CSSProperties = useWindow
    ? {}
    : { height: "100%", overflowY: "auto" };

  return (
    <div ref={scrollViewRef} style={containerStyles} className={className}>
      <div
        ref={topSentinelRef}
        style={{ height: 10, marginBottom: -10, overflowAnchor: "none" }}
      />
      {isUpLoading && <div ref={spinnerWrapperRef}>{spinnerRow}</div>}
      <div ref={listWrapperRef} className={listClassName}>
        {items.map((item: T) => (
          <div key={itemKey(item)} data-item-key={itemKey(item)}>
            {renderItem(item)}
          </div>
        ))}
      </div>
      {isDownLoading && spinnerRow}
      <div ref={bottomSentinelRef} style={{ height: 10, marginTop: -10 }} />
      {items.length === 0 && !isUpLoading && !isDownLoading && emptyState}
    </div>
  );
}
