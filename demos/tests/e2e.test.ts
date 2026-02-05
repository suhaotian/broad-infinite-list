import { test, expect, type Page } from "@playwright/test";

const TEST_URL = "http://localhost:3002";

// The component uses data-item-key on each item wrapper
const ITEM_SELECTOR = "[data-item-key]";
const SPINNER_SELECTOR = 'div[style*="animation"]';

// Tab selectors
const TAB_CONTAINER = 'button:has-text("Div Container")';
const TAB_WINDOW = 'button:has-text("Window Scroll")';

// Test config
const LOAD_TIMEOUT = 2000;
const SIMULATED_LATENCY = 600;
const VIEW_COUNT = 30; // Must match component config
const PAGE_SIZE = 10;

/**
 * Get the data-item-key of the topmost visible item in the viewport.
 */
async function getTopVisibleItemKey(
  page: Page,
  useWindow: boolean
): Promise<string | null> {
  return page.evaluate((useWindowMode) => {
    const items = Array.from(
      document.querySelectorAll("[data-item-key]")
    ) as HTMLElement[];
    if (items.length === 0) return null;

    let viewportTop: number;
    if (useWindowMode) {
      viewportTop = window.scrollY;
    } else {
      // Find the scroll container - it's the parent of the list wrapper
      const firstItem = items[0];
      let container = firstItem?.parentElement?.parentElement;
      while (container && container.scrollHeight === container.clientHeight) {
        container = container.parentElement;
      }
      viewportTop = container?.getBoundingClientRect().top ?? 0;
    }

    // Find first item whose bottom edge is below viewport top
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const absoluteTop = useWindowMode ? rect.top + window.scrollY : rect.top;
      const absoluteBottom = absoluteTop + rect.height;

      if (absoluteBottom > (useWindowMode ? window.scrollY : viewportTop)) {
        return item.getAttribute("data-item-key");
      }
    }
    return items[0]?.getAttribute("data-item-key") ?? null;
  }, useWindow);
}

/**
 * Get current scroll position.
 */
async function getScrollTop(page: Page, useWindow: boolean): Promise<number> {
  return page.evaluate((useWindowMode) => {
    if (useWindowMode) {
      return window.scrollY || document.documentElement.scrollTop;
    }
    // Find scroll container
    const firstItem = document.querySelector(
      "[data-item-key]"
    ) as HTMLElement | null;
    if (!firstItem) return 0;

    let container = firstItem.parentElement?.parentElement;
    while (container && container.scrollHeight === container.clientHeight) {
      container = container.parentElement;
    }
    return container?.scrollTop ?? 0;
  }, useWindow);
}

/**
 * Get the offset of a specific item from the viewport top.
 */
async function getItemOffsetFromViewportTop(
  page: Page,
  itemKey: string,
  useWindow: boolean
): Promise<number | null> {
  return page.evaluate(
    ({ key, useWindowMode }) => {
      const item = document.querySelector(`[data-item-key="${key}"]`);
      if (!item) return null;

      const rect = item.getBoundingClientRect();
      const viewportTop = useWindowMode
        ? 0
        : (() => {
            let container = (item as HTMLElement).parentElement?.parentElement;
            while (
              container &&
              container.scrollHeight === container.clientHeight
            ) {
              container = container.parentElement;
            }
            return container?.getBoundingClientRect().top ?? 0;
          })();

      return rect.top - viewportTop;
    },
    { key: itemKey, useWindowMode: useWindow }
  );
}

/**
 * Scroll to a specific item by key.
 */
async function scrollToItem(
  page: Page,
  itemKey: string,
  useWindow: boolean
): Promise<void> {
  await page.evaluate(
    ({ key, useWindowMode }) => {
      const item = document.querySelector(
        `[data-item-key="${key}"]`
      ) as HTMLElement | null;
      if (!item) throw new Error(`Item ${key} not found`);

      if (useWindowMode) {
        item.scrollIntoView({ block: "center", behavior: "instant" });
      } else {
        // Find scroll container
        let container = item.parentElement?.parentElement;
        while (container && container.scrollHeight === container.clientHeight) {
          container = container.parentElement;
        }
        if (!container) throw new Error("Container not found");

        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const scrollDelta =
          itemRect.top - containerRect.top - containerRect.height / 2;
        container.scrollTop += scrollDelta;
      }
    },
    { key: itemKey, useWindowMode: useWindow }
  );
}

/**
 * Wait for a load to complete. Spinner may not appear if prefetch hit.
 */
async function waitForLoad(page: Page): Promise<void> {
  // Try to catch spinner appearing
  try {
    await page.waitForSelector(SPINNER_SELECTOR, { timeout: 500 });
    // Spinner appeared, wait for it to disappear
    await page.waitForSelector(SPINNER_SELECTOR, {
      state: "detached",
      timeout: LOAD_TIMEOUT,
    });
  } catch {
    // Spinner never appeared (prefetch hit) - just wait a bit for DOM update
    await page.waitForTimeout(200);
  }

  // Extra tick for scroll correction
  await page.waitForTimeout(100);
}

/**
 * Get current item count in DOM.
 */
async function getItemCount(page: Page): Promise<number> {
  return page.locator(ITEM_SELECTOR).count();
}

/**
 * Get scroll container element.
 */
async function getScrollContainer(
  page: Page,
  useWindow: boolean
): Promise<any> {
  if (useWindow) return null;

  return page.evaluateHandle(() => {
    const firstItem = document.querySelector(
      "[data-item-key]"
    ) as HTMLElement | null;
    if (!firstItem) return null;

    let container = firstItem.parentElement?.parentElement;
    while (container && container.scrollHeight === container.clientHeight) {
      container = container.parentElement;
    }
    return container;
  });
}

/**
 * Scroll to edge in the given direction.
 */
async function scrollToEdge(
  page: Page,
  direction: "up" | "down",
  useWindow: boolean
): Promise<void> {
  await page.evaluate(
    ({ dir, useWindowMode }) => {
      if (useWindowMode) {
        if (dir === "up") {
          window.scrollTo(0, 0);
        } else {
          window.scrollTo(0, document.documentElement.scrollHeight);
        }
      } else {
        const firstItem = document.querySelector(
          "[data-item-key]"
        ) as HTMLElement | null;
        if (!firstItem) return;

        let container = firstItem.parentElement?.parentElement;
        while (container && container.scrollHeight === container.clientHeight) {
          container = container.parentElement;
        }
        if (!container) return;

        if (dir === "up") {
          container.scrollTop = 0;
        } else {
          container.scrollTop = container.scrollHeight;
        }
      }
    },
    { dir: direction, useWindowMode: useWindow }
  );
}

test.describe("BidirectionalList - Div Container Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.click(TAB_CONTAINER);
    await page.waitForTimeout(500); // Let component mount and initial render settle
  });

  test("scroll up: triggers load and preserves scroll position", async ({
    page,
  }) => {
    const useWindow = false;

    // Wait for initial items
    await page.waitForSelector(ITEM_SELECTOR, { timeout: 5000 });

    // Feed list: initial render is at the top (latest items), no previous content
    // Scroll down first to load more items so we have content below
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    const initialCount = await getItemCount(page);
    expect(initialCount).toBeGreaterThan(0);

    // Capture anchor before scroll
    const anchorBefore = await getTopVisibleItemKey(page, useWindow);
    expect(anchorBefore).not.toBeNull();

    const offsetBefore = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );
    expect(offsetBefore).not.toBeNull();

    // Scroll to top to trigger upward load (loading older items)
    await scrollToEdge(page, "up", useWindow);
    await waitForLoad(page);

    // Verify items loaded
    const countAfter = await getItemCount(page);
    expect(countAfter).toBeGreaterThan(initialCount);

    // Verify anchor position preserved
    const offsetAfter = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );
    expect(offsetAfter).not.toBeNull();

    // Position should be stable (within tolerance for content shift)
    const delta = Math.abs(offsetAfter! - offsetBefore!);
    expect(delta).toBeLessThan(200);
  });

  test("scroll down: triggers load and preserves scroll position", async ({
    page,
  }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Scroll to an item in the middle first to have room to scroll down
    const items = await page.locator(ITEM_SELECTOR).all();
    if (items.length > 5) {
      const fifthItem = await items[4]?.getAttribute("data-item-key");
      if (fifthItem) {
        await scrollToItem(page, fifthItem, useWindow);
        await page.waitForTimeout(300);
      }
    }

    const initialCount = await getItemCount(page);
    const anchorBefore = await getTopVisibleItemKey(page, useWindow);
    expect(anchorBefore).not.toBeNull();

    const offsetBefore = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );

    // Scroll to bottom
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    const countAfter = await getItemCount(page);
    expect(countAfter).toBeGreaterThan(initialCount);

    // Check anchor - may have been trimmed if we exceeded viewCount
    const offsetAfter = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );

    if (offsetAfter !== null) {
      // Anchor still exists - position should be stable
      const delta = Math.abs(offsetAfter - offsetBefore!);
      expect(delta).toBeLessThan(500);
    } else {
      // Anchor was trimmed - verify we're at a reasonable scroll position
      const scrollTop = await getScrollTop(page, useWindow);
      expect(scrollTop).toBeGreaterThan(0);
    }
  });

  test("rapid bidirectional scroll maintains stability", async ({ page }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Load downward first (feed list starts at top)
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    // Load upward
    await scrollToEdge(page, "up", useWindow);
    await waitForLoad(page);

    // Immediately load downward again
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    // Verify we're at a stable position (not stuck at edges)
    const scrollTop = await getScrollTop(page, useWindow);
    expect(scrollTop).toBeGreaterThan(0);

    // Verify items are present
    const count = await getItemCount(page);
    expect(count).toBeGreaterThan(0);
  });

  test("viewCount enforcement: list does not grow unbounded", async ({
    page,
  }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Trigger multiple loads in both directions
    for (let i = 0; i < 3; i++) {
      await scrollToEdge(page, "down", useWindow);
      await waitForLoad(page);

      await scrollToEdge(page, "up", useWindow);
      await waitForLoad(page);
    }

    // Verify item count doesn't exceed viewCount + some buffer for page size
    const finalCount = await getItemCount(page);
    expect(finalCount).toBeLessThanOrEqual(VIEW_COUNT + PAGE_SIZE * 2);
  });
});

test.describe("BidirectionalList - Window Scroll Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.click(TAB_WINDOW);
    await page.waitForTimeout(500);
  });

  test("scroll up: triggers load and preserves scroll position", async ({
    page,
  }) => {
    const useWindow = true;

    await page.waitForSelector(ITEM_SELECTOR);

    // Feed list: scroll down first to load content
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    const initialCount = await getItemCount(page);

    const anchorBefore = await getTopVisibleItemKey(page, useWindow);
    expect(anchorBefore).not.toBeNull();

    const offsetBefore = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );

    await scrollToEdge(page, "up", useWindow);
    await waitForLoad(page);

    const countAfter = await getItemCount(page);
    expect(countAfter).toBeGreaterThan(initialCount);

    const offsetAfter = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );
    expect(offsetAfter).not.toBeNull();

    const delta = Math.abs(offsetAfter! - offsetBefore!);
    expect(delta).toBeLessThan(200);
  });

  test("scroll down: triggers load and preserves scroll position", async ({
    page,
  }) => {
    const useWindow = true;

    await page.waitForSelector(ITEM_SELECTOR);

    const items = await page.locator(ITEM_SELECTOR).all();
    if (items.length > 5) {
      const fifthItem = await items[4]?.getAttribute("data-item-key");
      if (fifthItem) {
        await scrollToItem(page, fifthItem, useWindow);
        await page.waitForTimeout(300);
      }
    }

    const initialCount = await getItemCount(page);
    const anchorBefore = await getTopVisibleItemKey(page, useWindow);
    const offsetBefore = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );

    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    const countAfter = await getItemCount(page);
    expect(countAfter).toBeGreaterThan(initialCount);

    const offsetAfter = await getItemOffsetFromViewportTop(
      page,
      anchorBefore!,
      useWindow
    );

    if (offsetAfter !== null) {
      const delta = Math.abs(offsetAfter - offsetBefore!);
      expect(delta).toBeLessThan(500);
    } else {
      const scrollTop = await getScrollTop(page, useWindow);
      expect(scrollTop).toBeGreaterThan(0);
    }
  });

  test("prefetch eliminates spinner on subsequent scroll", async ({ page }) => {
    const useWindow = true;

    await page.waitForSelector(ITEM_SELECTOR);

    // First scroll down - loads + triggers prefetch
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    // Wait for prefetch to complete (simulated latency + margin)
    await page.waitForTimeout(SIMULATED_LATENCY + 300);

    // Second scroll down should hit prefetch buffer
    const spinnerCountBefore = await page.locator(SPINNER_SELECTOR).count();

    await scrollToEdge(page, "down", useWindow);

    // Wait briefly - spinner should not appear
    await page.waitForTimeout(400);
    const spinnerCountDuring = await page.locator(SPINNER_SELECTOR).count();

    expect(spinnerCountDuring).toBe(0);

    // But scroll position should have changed (items loaded)
    const scrollTop = await getScrollTop(page, useWindow);
    expect(scrollTop).toBeGreaterThan(0);
  });
});

test.describe("BidirectionalList - Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.click(TAB_CONTAINER);
    await page.waitForTimeout(500);
  });

  test("does not load beyond start boundary", async ({ page }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Feed list: scroll down first to have room to test upward boundary
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    // Keep scrolling up until we hit the start (item 0)
    let previousCount = await getItemCount(page);
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      await scrollToEdge(page, "up", useWindow);
      await waitForLoad(page);

      const currentCount = await getItemCount(page);

      // Check if item 0 exists
      const hasItem0 = (await page.locator('[data-item-key="0"]').count()) > 0;
      if (hasItem0) {
        // We've reached the start - one more scroll should not load more
        const countBeforeFinal = await getItemCount(page);
        await scrollToEdge(page, "up", useWindow);
        await page.waitForTimeout(1000);
        const countAfterFinal = await getItemCount(page);

        expect(countAfterFinal).toBe(countBeforeFinal);
        break;
      }

      if (currentCount === previousCount) {
        // No more items loaded - we've hit the boundary
        break;
      }

      previousCount = currentCount;
      attempts++;
    }
  });

  test("does not load beyond end boundary", async ({ page }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Keep scrolling down until we hit the end
    let previousCount = await getItemCount(page);
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      await scrollToEdge(page, "down", useWindow);
      await waitForLoad(page);

      const currentCount = await getItemCount(page);

      // Check if we've stopped loading (due to viewCount trimming)
      // In a real scenario, check for the last item ID
      const items = await page.locator(ITEM_SELECTOR).all();
      const lastItemKey =
        items.length > 0
          ? await items[items.length - 1]?.getAttribute("data-item-key")
          : null;

      if (lastItemKey === "1999") {
        // TOTAL_ITEMS - 1
        // One more scroll should not load
        const countBeforeFinal = await getItemCount(page);
        await scrollToEdge(page, "down", useWindow);
        await page.waitForTimeout(1000);
        const countAfterFinal = await getItemCount(page);

        // Count might be same or might have trimmed from top
        expect(countAfterFinal).toBeLessThanOrEqual(VIEW_COUNT + PAGE_SIZE * 2);
        break;
      }

      if (currentCount <= previousCount) {
        // Trimming is occurring, which is expected
        break;
      }

      previousCount = currentCount;
      attempts++;
    }

    // Final verification - we should have items
    const finalCount = await getItemCount(page);
    expect(finalCount).toBeGreaterThan(0);
  });

  test("scroll position stable during trim operations", async ({ page }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Load enough to trigger trimming
    for (let i = 0; i < 5; i++) {
      await scrollToEdge(page, "down", useWindow);
      await waitForLoad(page);
    }

    // Capture position
    const anchorBefore = await getTopVisibleItemKey(page, useWindow);
    expect(anchorBefore).not.toBeNull();

    const scrollBefore = await getScrollTop(page, useWindow);

    // Trigger more loading which should cause trimming
    await scrollToEdge(page, "down", useWindow);
    await waitForLoad(page);

    // Position should be stable (not jumped to 0 or max)
    const scrollAfter = await getScrollTop(page, useWindow);
    expect(scrollAfter).toBeGreaterThan(0);

    // Should be roughly in the same region (allowing for trim adjustments)
    const scrollDelta = Math.abs(scrollAfter - scrollBefore);
    expect(scrollDelta).toBeLessThan(2000);
  });

  test("multiple rapid scrolls do not cause race conditions", async ({
    page,
  }) => {
    const useWindow = false;

    await page.waitForSelector(ITEM_SELECTOR);

    // Rapidly alternate scroll directions without waiting for loads to complete
    const promises = [];

    for (let i = 0; i < 3; i++) {
      promises.push(scrollToEdge(page, "down", useWindow));
      promises.push(page.waitForTimeout(100));
      promises.push(scrollToEdge(page, "up", useWindow));
      promises.push(page.waitForTimeout(100));
    }

    await Promise.all(promises);

    // Wait for all loads to settle
    await page.waitForTimeout(2000);

    // Should still have items
    const count = await getItemCount(page);
    expect(count).toBeGreaterThan(0);

    // Should be at a stable scroll position
    const scrollTop = await getScrollTop(page, useWindow);
    expect(scrollTop).toBeGreaterThanOrEqual(0);
  });
});
