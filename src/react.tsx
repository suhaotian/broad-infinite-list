import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  type ForwardedRef,
  type RefObject,
} from "react";
import { waitForMutation } from "./utils";

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
const getRAF = () => requestAnimationFrame;
const getRootEl = () => document.documentElement;

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
  const loadingLockRef = useRef<Record<LoadDirection, boolean>>({
    up: false,
    down: false,
  });
  const [isUpLoading, setIsUpLoading] = useState<boolean>(false);
  const [isDownLoading, setIsDownLoading] = useState<boolean>(false);
  const isAdjustingRef = useRef<boolean>(false);
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;

  const scrollTo = useCallback(
    (top: number, behavior: ScrollBehavior = "smooth") => {
      if (useWindow)
        getRootEl().scrollTo({
          top,
          behavior,
        });
      else if (scrollViewRef.current)
        scrollViewRef.current.scrollTo({
          top,
          behavior,
        });
    },
    [scrollViewRef, useWindow]
  );

  useImperativeHandle(ref, () => ({
    scrollViewRef: useWindow ? { current: getRootEl() } : scrollViewRef,
    scrollTo,
    scrollToKey(key, behavior) {
      const containerEl = useWindow ? getRootEl() : scrollViewRef.current;
      const el = containerEl?.querySelector(`[data-key="${key}"]`);
      if (el) {
        el.scrollIntoView({ behavior, block: "start" });
      }
    },
    scrollToTop(behavior) {
      scrollTo(0, behavior);
    },
    scrollToBottom(behavior) {
      const container = useWindow ? getRootEl() : scrollViewRef.current;
      if (container) {
        const height = container.scrollHeight;
        scrollTo(height, behavior);
      }
    },
  }));

  const getScrollTop = useCallback((): number => {
    if (useWindow) return window.scrollY || getRootEl().scrollTop;
    return scrollViewRef.current?.scrollTop ?? 0;
  }, [useWindow]);

  const setScrollTop = useCallback(
    (value: number): void => {
      onScrollStart?.();
      if (useWindow) getRootEl().scrollTop = value;
      // else if (scrollViewRef.current) scrollViewRef.current.scrollTop = value;
      else if (scrollViewRef.current)
        scrollViewRef.current.scrollTo({ top: value, behavior: "auto" });
      onScrollEnd?.();
    },
    [useWindow, onScrollStart, onScrollEnd]
  );

  const getViewportTop = useCallback((): number => {
    if (useWindow) return 0;
    return scrollViewRef.current?.getBoundingClientRect().top ?? 0;
  }, [useWindow]);

  const findElementByKey = useCallback((key: string): Element | null => {
    const wrapper = listWrapperRef.current;
    if (!wrapper) return null;
    return wrapper.querySelector(`[data-item-key="${key}"]`);
  }, []);

  /**
   * Restores scroll so the anchor stays visually pinned after items above it
   * are trimmed. Only used for down-load trim. Retries once if the anchor
   * isn't in the DOM yet (parent state update hasn't flushed).
   */
  const restoreScrollToAnchor = useCallback(
    (anchorKey: string, anchorOffsetBefore: number): void => {
      let attempts = 0;
      const maxAttempts = 10;

      const tryRestore = (): void => {
        const el = findElementByKey(anchorKey);

        if (!el) {
          attempts++;
          if (attempts < maxAttempts) {
            getRAF()(tryRestore);
          } else {
            isAdjustingRef.current = false;
          }
          return;
        }

        const anchorOffsetAfter =
          el.getBoundingClientRect().top - getViewportTop();
        const delta = anchorOffsetAfter - anchorOffsetBefore;
        if (Math.abs(delta) > 1) {
          setScrollTop(getScrollTop() + delta);
        }
        isAdjustingRef.current = false;
      };

      getRAF()(tryRestore);
    },
    [findElementByKey, getViewportTop, getScrollTop, setScrollTop]
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
        const ref: T =
          direction === "up"
            ? (currentItems[0] as T)
            : (currentItems[currentItems.length - 1] as T);
        const newItems: T[] = await onLoadMore(direction, ref);

        if (newItems.length === 0) {
          if (direction === "up") setIsUpLoading(false);
          else setIsDownLoading(false);
          isAdjustingRef.current = false;
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
          const anchorKey: string = itemKey(currentItems[0] as T);
          const anchorEl: Element | null = findElementByKey(anchorKey);
          const anchorOffsetBefore: number = anchorEl
            ? anchorEl.getBoundingClientRect().top - getViewportTop()
            : 0;

          let nextItems: T[] = [...newItems, ...currentItems];
          if (nextItems.length > viewCount) {
            /**
             * Trim from the bottom (opposite end from prepend).
             * Removed items are below the viewport — no scroll effect.
             */
            nextItems = nextItems.slice(0, viewCount);
          }

          /** Commit new items and hide the up-spinner. */
          onItemsChange?.(nextItems);
          setIsUpLoading(false);

          /**
           * Restore after paint so the prepended + trimmed DOM is measured.
           * The anchor element (old first item) is still in nextItems — it
           * survived the prepend and any bottom-trim — so it will be in the
           * DOM when the rAF fires.
           */
          if (listWrapperRef.current) {
            waitForMutation(listWrapperRef.current, () => {
              restoreScrollToAnchor(anchorKey, anchorOffsetBefore);
            });
          } else {
            isAdjustingRef.current = false;
          }
        } else {
          let nextItems: T[] = [...currentItems, ...newItems];
          let didTrim: boolean = false;
          let anchorKey: string = "";
          let anchorOffsetBefore: number = 0;

          if (nextItems.length > viewCount) {
            const countToRemove: number = nextItems.length - viewCount;
            nextItems = nextItems.slice(countToRemove);
            didTrim = true;

            /**
             * Anchor = first survivor after trim. It's in the DOM now (was in
             * currentItems). Down-spinner is below it — safe to measure.
             */
            anchorKey = itemKey(nextItems[0] as T);
            const anchorEl: Element | null = findElementByKey(anchorKey);
            if (anchorEl)
              anchorOffsetBefore =
                anchorEl.getBoundingClientRect().top - getViewportTop();
          }

          /** Commit and hide spinner. */
          onItemsChange?.(nextItems);
          setIsDownLoading(false);

          if (didTrim && listWrapperRef.current) {
            waitForMutation(listWrapperRef.current, () => {
              restoreScrollToAnchor(anchorKey, anchorOffsetBefore);
            });
          } else {
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
      viewCount,
      itemKey,
      findElementByKey,
      getViewportTop,
      restoreScrollToAnchor,
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

  /**
   * overflow-anchor: auto (default) handles up-load pinning natively.
   * Top sentinel has overflow-anchor:none so the browser skips it and anchors
   * to the first real list item.
   */
  const containerStyles: React.CSSProperties = useWindow
    ? {}
    : { height: "100%", overflowY: "auto" };

  return (
    <div ref={scrollViewRef} style={containerStyles} className={className}>
      <div
        ref={topSentinelRef}
        style={{ height: 1, marginBottom: -1, overflowAnchor: "none" }}
      />
      {isUpLoading && spinnerRow}
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
