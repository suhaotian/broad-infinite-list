import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  type ForwardedRef,
  type RefObject,
  type CSSProperties,
} from "react";
import { useNextTickLayout as useNextTick } from "use-next-tick";

export interface BidirectionalListRef<T = any> {
  /** Reference to the scrollable container element */
  scrollViewRef: RefObject<HTMLElement | null>;
  /** Scroll to the top of the list */
  scrollToTop: (behavior?: ScrollBehavior) => void;
  /** Scroll to the bottom of the list */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Scroll to a specific pixel offset from top */
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  /** Scroll to an item by its key */
  scrollToKey: (
    key: string | number,
    behavior?: ScrollBehavior,
    block?: ScrollLogicalPosition
  ) => void;
  /** Get current distance to top */
  getTopDistance: () => number;
  /** Get current distance to bottom */
  getBottomDistance: () => number;
  /** Manual handle load */
  handleLoad: (
    direction: "up" | "down",
    loadMore: () => T[] | Promise<T[]>
  ) => void;
}

export interface BidirectionalListProps<T> {
  /** Current array of items to display */
  items: T[];
  /** Function to extract a unique key from each item */
  itemKey: (item: T) => string | number;
  /** Function to render each item */
  renderItem: (item: T) => React.ReactNode;
  /** Called when more items should be loaded; returns the new items to prepend/append */
  onLoadMore: (direction: "up" | "down", refItem: T) => Promise<T[]>;
  /** Called when the items array changes due to loading or trimming */
  onItemsChange?: (items: T[]) => void;
  /** container element, default: div */
  containerAs?: React.ElementType;
  /** list wrapper element, default: div */
  as?: React.ElementType;
  /** item element, default: div */
  itemAs?: React.ElementType;
  /** The container div's className */
  className?: string;
  /** The list wrapper tag's className */
  listClassName?: string;
  /** The list item tag's className */
  itemClassName?: string | ((item: T, index: number) => string | undefined);
  itemStyle?:
    | CSSProperties
    | ((item: T, index: number) => CSSProperties | undefined);
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
  /** for table */
  headerSlot?: ({ children }: { children: React.ReactNode }) => React.ReactNode;
  /** for table */
  footerSlot?: ({ children }: { children: React.ReactNode }) => React.ReactNode;
}
export type LoadDirection = "up" | "down";

const LOAD_COOLDOWN_MS = 150;
const MIN_SCROLL_DELTA = 1;
const getRootEl = () => document.documentElement;

/** Snapshot an element's visual position relative to the viewport/container top. */
function snapshotAnchor(
  key: string | number,
  findElementByKey: (key: string | number) => Element | null,
  getViewportTop: () => number
): { key: string | number; offset: number } | null {
  const el = findElementByKey(key);
  if (!el) return null;
  return { key, offset: el.getBoundingClientRect().top - getViewportTop() };
}

/**
 * Compute how far to adjust scrollTop so that an anchor element stays
 * at its previous visual offset. Returns 0 if not applicable.
 */
function computeAnchorDelta(
  anchor: { key: string | number; offset: number } | null,
  findElementByKey: (key: string | number) => Element | null,
  getViewportTop: () => number
): number {
  if (!anchor) return 0;
  const el = findElementByKey(anchor.key);
  if (!el) return 0;
  const currentOffset = el.getBoundingClientRect().top - getViewportTop();
  const delta = currentOffset - anchor.offset;
  return Math.abs(delta) > MIN_SCROLL_DELTA ? delta : 0;
}

export default function BidirectionalList<T>({
  items,
  itemKey,
  renderItem,
  onLoadMore,
  onItemsChange,
  containerAs = "div",
  as = "div",
  itemAs = "div",
  spinnerRow = (
    <div style={{ padding: 20, textAlign: "center" }}>Loading...</div>
  ),
  className,
  listClassName,
  itemClassName,
  itemStyle,
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
  headerSlot = ({ children }) => children,
  footerSlot = ({ children }) => children,
}: BidirectionalListProps<T> & {
  ref?: ForwardedRef<BidirectionalListRef<T>>;
}) {
  const nextTick = useNextTick();

  // DOM refs
  const scrollViewRef = useRef<HTMLDivElement>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const spinnerWrapperRef = useRef<HTMLDivElement>(null);

  // Mutable state that doesn't need re-renders
  const loadingLockRef = useRef<Record<LoadDirection, boolean>>({
    up: false,
    down: false,
  });
  const isAdjustingRef = useRef(false);
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;

  // Pending scroll-restoration info, set before React commits, consumed in nextTick
  const pendingRestoreRef = useRef<{
    type: "prepend" | "down-trim";
    anchor: { key: string | number; offset: number; scrollTop?: number } | null;
  } | null>(null);

  const [isUpLoading, setIsUpLoading] = useState(false);
  const [isDownLoading, setIsDownLoading] = useState(false);

  // ── Scroll primitives ───────────────────────────────────────────────────

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

  const scrollTo = useCallback(
    (top: number, behavior: ScrollBehavior = "smooth") => {
      if (useWindow) getRootEl().scrollTo({ top, behavior });
      else scrollViewRef.current?.scrollTo({ top, behavior });
    },
    [useWindow]
  );

  const getViewportTop = useCallback((): number => {
    if (useWindow) return 0;
    return scrollViewRef.current?.getBoundingClientRect().top ?? 0;
  }, [useWindow]);

  const findElementByKey = useCallback(
    (key: string | number): Element | null => {
      const container = useWindow ? getRootEl() : scrollViewRef.current;
      if (!container) return null;
      return container.querySelector(`[data-id="${key}"]`);
    },
    [useWindow]
  );

  const resolveItemClass = useCallback(
    (item: T, index: number) => {
      if (!itemClassName) return "";
      if (typeof itemClassName === "string") {
        return itemClassName;
      }
      return itemClassName(item, index);
    },
    [itemClassName]
  );
  const resolveItemStyle = useCallback(
    (item: T, index: number) => {
      if (!itemStyle) return {};
      if (typeof itemStyle === "object") {
        return itemStyle;
      }
      return itemStyle(item, index);
    },
    [itemStyle]
  );

  const getTopDistance = useCallback(() => {
    const container = useWindow ? getRootEl() : scrollViewRef.current;
    return (container?.scrollTop || 0) as number;
  }, [useWindow]);

  const getBottomDistance = useCallback(() => {
    const container = useWindow ? getRootEl() : scrollViewRef.current;
    if (!container) return 0;

    // scrollHeight: Total height of the content
    // scrollTop: How far we've scrolled from the top
    // clientHeight: The visible height of the container
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight
    );
  }, [useWindow]);

  // ── Imperative handle ───────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    scrollViewRef: useWindow
      ? ({ current: getRootEl() } as RefObject<HTMLElement>)
      : scrollViewRef,
    scrollTo,
    scrollToKey(key, behavior, block = "start") {
      const el = findElementByKey(key);
      if (el) el.scrollIntoView({ behavior, block });
    },
    scrollToTop(behavior) {
      scrollTo(0, behavior);
    },
    scrollToBottom(behavior) {
      const container = useWindow ? getRootEl() : scrollViewRef.current;
      if (container) scrollTo(container.scrollHeight, behavior);
    },
    getTopDistance,
    getBottomDistance,
    handleLoad: (
      direction: "up" | "down",
      loadMore: () => T[] | Promise<T[]>
    ) => {
      handleLoad(direction, loadMore);
    },
  }));

  // ── Scroll restoration (runs in nextTick after React commits) ───────────

  const applyScrollRestore = useCallback(() => {
    const pending = pendingRestoreRef.current;
    if (!pending) {
      isAdjustingRef.current = false;
      return;
    }
    pendingRestoreRef.current = null;

    const delta = computeAnchorDelta(
      pending.anchor,
      findElementByKey,
      getViewportTop
    );
    if (delta !== 0) setScrollTop(getScrollTop() + delta + (pending.anchor?.scrollTop ?? 0));

    isAdjustingRef.current = false;
  }, [findElementByKey, getViewportTop, getScrollTop, setScrollTop]);

  // ── Load handler ────────────────────────────────────────────────────────

  const handleLoad = useCallback(
    async (
      direction: LoadDirection,
      loadMore?: () => T[] | Promise<T[]>
    ): Promise<void> => {
      if (disable) return;

      const _setIsUpLoading = (loading: boolean) => {
        if (loadMore) return;
        setIsUpLoading(loading);
      };
      const _setIsDownLoading = (loading: boolean) => {
        if (loadMore) return;
        setIsDownLoading(loading);
      };
      const isUp = direction === "up";
      if (!loadMore) {
        if (isUp && !hasPrevious) return;
        if (!isUp && !hasNext) return;
      }
      if (loadingLockRef.current[direction]) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      loadingLockRef.current[direction] = true;
      if (loadMore) {
        loadingLockRef.current[direction === "up" ? "down" : "up"] = true;
      }
      isAdjustingRef.current = true;
      let released = false;

      if (isUp) {
        _setIsUpLoading(true);
        // Wait for spinner to render so we can measure it as the anchor offset.
        // The first visible item sits below the spinner, so its visual offset
        // equals the spinner height.
        const onNextTick = () => {
          const spinnerHeight =
            spinnerWrapperRef.current?.getBoundingClientRect().height ?? 0;
          const firstKey =
            itemsRef.current.length > 0
              ? itemKey(itemsRef.current[0] as T)
              : null;
          if (firstKey) {
            // For prepend, the anchor's "previous offset" is the spinner height
            // because the anchor sat directly below the spinner before new items appeared.
            pendingRestoreRef.current = {
              type: "prepend",
              anchor: { key: firstKey, offset: spinnerHeight, scrollTop: loadMore ? getScrollTop() : 0 },
            };
          }
        };
        loadMore ? onNextTick() : nextTick(onNextTick);
      } else {
        _setIsDownLoading(true);
      }

      try {
        const refItem: T = isUp
          ? (currentItems[0] as T)
          : (currentItems[currentItems.length - 1] as T);

        const newItems = await (loadMore
          ? new Promise((r) => setTimeout(r, 200)).then(() => loadMore())
          : onLoadMore(direction, refItem));

        if (newItems.length === 0) {
          if (isUp) _setIsUpLoading(false);
          else _setIsDownLoading(false);
          isAdjustingRef.current = false;
          released = true;
          loadingLockRef.current[direction] = false;
          if (loadMore) {
            loadingLockRef.current[direction === "up" ? "down" : "up"] = false;
          }
          pendingRestoreRef.current = null;
          return;
        }

        if (isUp) {
          let nextItems = [...newItems, ...currentItems];
          if (nextItems.length > viewCount) {
            nextItems = nextItems.slice(0, viewCount);
          }

          onItemsChange?.(nextItems);
          _setIsUpLoading(false);
          nextTick(applyScrollRestore);
        } else {
          let nextItems = [...currentItems, ...newItems];
          let didTrim = false;

          if (nextItems.length > viewCount) {
            const countToRemove = nextItems.length - viewCount;
            nextItems = nextItems.slice(countToRemove);
            didTrim = true;

            // Snapshot the new first item's position before React removes the trimmed items
            const anchorKey = itemKey(nextItems[0] as T);
            pendingRestoreRef.current = {
              type: "down-trim",
              anchor: snapshotAnchor(
                anchorKey,
                findElementByKey,
                getViewportTop
              ),
            };
          }

          onItemsChange?.(nextItems);
          _setIsDownLoading(false);

          if (didTrim) {
            nextTick(applyScrollRestore);
          } else {
            isAdjustingRef.current = false;
          }
        }
      } catch {
        {
          if (isUp) _setIsUpLoading(false);
          else _setIsDownLoading(false);
        }
        isAdjustingRef.current = false;
      } finally {
        if (!released) {
          setTimeout(() => {
            loadingLockRef.current[direction] = false;
            if (loadMore) {
              loadingLockRef.current[direction === "up" ? "down" : "up"] =
                false;
            }
          }, LOAD_COOLDOWN_MS);
        }
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
      findElementByKey,
      getViewportTop,
      nextTick,
      applyScrollRestore,
    ]
  );

  // ── IntersectionObserver for sentinel elements ──────────────────────────

  useEffect(() => {
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (!top || !bottom || disable) return;
    if (!hasNext && !hasPrevious) return;

    const root: HTMLDivElement | null = useWindow
      ? null
      : scrollViewRef.current;

    const obs = new IntersectionObserver(
      (entries) => {
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

  const containerStyles: CSSProperties = useWindow
    ? {}
    : { height: "100%", overflowY: "auto" };

  const ContainerTag = containerAs || "div";
  const ListWrapperTag = as || "div";
  const ItemTag = itemAs || "div";

  return (
    <ContainerTag
      ref={scrollViewRef}
      style={containerStyles}
      className={className}>
      {headerSlot({
        children: (
          <>
            <div
              ref={topSentinelRef}
              style={{ height: 1, marginBottom: -1, overflowAnchor: "none" }}
            />
            {isUpLoading && <div ref={spinnerWrapperRef}>{spinnerRow}</div>}
          </>
        ),
      })}

      <ListWrapperTag ref={listWrapperRef} className={listClassName}>
        {items.map((item: T, index) => (
          <ItemTag
            key={itemKey(item)}
            data-id={itemKey(item)}
            className={resolveItemClass(item, index)}
            style={resolveItemStyle(item, index)}>
            {renderItem(item)}
          </ItemTag>
        ))}
      </ListWrapperTag>
      {footerSlot({
        children: (
          <>
            {isDownLoading && spinnerRow}
            <div ref={bottomSentinelRef} style={{ height: 1, marginTop: -1 }} />
          </>
        ),
      })}
      {items.length === 0 && !isUpLoading && !isDownLoading && emptyState}
    </ContainerTag>
  );
}
