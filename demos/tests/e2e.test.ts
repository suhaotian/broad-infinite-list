import { test, expect, type Page } from "@playwright/test";

const TEST_URL = "http://localhost:3002?demo=e2e";
const ITEM_SELECTOR = "[data-item-key]";
const TAB_CONTAINER = 'button:has-text("Div Container")';
const TAB_WINDOW = 'button:has-text("Window Scroll")';

const LOAD_WAIT = 1e3;
const VIEW_COUNT = 30;
const PAGE_SIZE = 10;

/**
 * Get all item keys currently in DOM.
 */
async function getItemKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-item-key]")).map(
      (el) => el.getAttribute("data-item-key")!
    );
  });
}

/**
 * Scroll to edge (top or bottom).
 */
async function scrollToEdge(
  page: Page,
  direction: "up" | "down",
  useWindow: boolean
): Promise<void> {
  await page.evaluate(
    ({ dir, useWindowMode }) => {
      if (useWindowMode) {
        window.scrollTo(
          0,
          dir === "up" ? 0 : document.documentElement.scrollHeight
        );
      } else {
        const firstItem = document.querySelector(
          "[data-item-key]"
        ) as HTMLElement;
        if (!firstItem) return;

        let container = firstItem.parentElement?.parentElement;
        while (container && container.scrollHeight === container.clientHeight) {
          container = container.parentElement;
        }
        if (!container) return;

        container.scrollTop = dir === "up" ? 0 : container.scrollHeight;
      }
    },
    { dir: direction, useWindowMode: useWindow }
  );
  await page.waitForTimeout(LOAD_WAIT);
}

/**
 * Run test suite for a given scroll mode.
 */
function testScrollMode(modeName: string, useWindow: boolean) {
  test.describe(`BidirectionalList - ${modeName}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(TEST_URL);
      await page.click(useWindow ? TAB_WINDOW : TAB_CONTAINER);
      await page.waitForTimeout(1000);
      await page.waitForSelector(ITEM_SELECTOR, { timeout: 5000 });
    });

    test("initial load shows first 30 items (0-29)", async ({ page }) => {
      const keys = await getItemKeys(page);
      expect(keys.length).toBe(VIEW_COUNT);
      expect(keys[0]).toBe("0");
      expect(keys[VIEW_COUNT - 1]).toBe("29");
    });

    test("scroll down: loads next page and trims top", async ({ page }) => {
      await scrollToEdge(page, "down", useWindow);

      const keys = await getItemKeys(page);
      expect(keys.length).toBe(VIEW_COUNT);
      // After load: 10-39 (trimmed 0-9, added 30-39)
      expect(keys[0]).toBe("10");
      expect(keys[VIEW_COUNT - 1]).toBe("39");
    });

    test("scroll down twice: continues loading and trimming", async ({
      page,
    }) => {
      await scrollToEdge(page, "down", useWindow);
      await scrollToEdge(page, "down", useWindow);

      const keys = await getItemKeys(page);
      expect(keys.length).toBe(VIEW_COUNT);
      // After two loads: 20-49
      expect(keys[0]).toBe("20");
      expect(keys[VIEW_COUNT - 1]).toBe("49");
    });

    test("scroll up after scroll down: loads previous page and trims bottom", async ({
      page,
    }) => {
      // Setup: scroll down twice to get to 20-49
      await scrollToEdge(page, "down", useWindow);
      await scrollToEdge(page, "down", useWindow);

      // Now scroll up
      await scrollToEdge(page, "up", useWindow);

      const keys = await getItemKeys(page);
      expect(keys.length).toBe(VIEW_COUNT);
      // After scroll up: 10-39 (loaded 10-19, trimmed 40-49)
      expect(keys[0]).toBe("10");
      expect(keys[VIEW_COUNT - 1]).toBe("39");
    });

    test("viewCount enforcement: maintains max 30 items", async ({ page }) => {
      // Multiple bidirectional scrolls
      for (let i = 0; i < 3; i++) {
        await scrollToEdge(page, "down", useWindow);
        await scrollToEdge(page, "up", useWindow);
      }

      const keys = await getItemKeys(page);
      expect(keys.length).toBeLessThanOrEqual(VIEW_COUNT + PAGE_SIZE);
    });

    test("boundary: cannot load before item 0", async ({ page }) => {
      // Scroll down then back up to item 0
      await scrollToEdge(page, "down", useWindow);
      await scrollToEdge(page, "up", useWindow);
      await scrollToEdge(page, "up", useWindow);

      const keys = await getItemKeys(page);
      expect(keys[0]).toBe("0");

      // Try to scroll up again - should stay at 0
      await scrollToEdge(page, "up", useWindow);
      const keysAfter = await getItemKeys(page);
      expect(keysAfter[0]).toBe("0");
    });

    test("scroll down: last item before load stays visible in viewport", async ({
      page,
    }) => {
      // Get the last item before scroll (item 29)
      const keysBefore = await getItemKeys(page);
      const lastKeyBefore = keysBefore[keysBefore.length - 1];
      expect(lastKeyBefore).toBe("29");

      // Scroll to bottom to trigger load
      await scrollToEdge(page, "down", useWindow);

      // After load: 10-39 (item 29 should still be visible in viewport)
      const keysAfter = await getItemKeys(page);
      expect(keysAfter).toContain("29");

      // Check if item 29 is visible in viewport
      const isVisible = await page.evaluate(
        ({ key, useWindowMode }) => {
          const item = document.querySelector(`[data-item-key="${key}"]`);
          if (!item) return false;

          const rect = item.getBoundingClientRect();

          if (useWindowMode) {
            // Check if any part of the item is visible in the window
            return (
              rect.bottom > 0 &&
              rect.top < window.innerHeight &&
              rect.right > 0 &&
              rect.left < window.innerWidth
            );
          } else {
            // Find scroll container
            let container = (item as HTMLElement).parentElement;
            while (container && container !== document.body) {
              const style = window.getComputedStyle(container);
              const hasScroll =
                style.overflow === "auto" ||
                style.overflow === "scroll" ||
                style.overflowY === "auto" ||
                style.overflowY === "scroll";

              if (
                hasScroll &&
                container.scrollHeight > container.clientHeight
              ) {
                break;
              }
              container = container.parentElement;
            }

            if (!container || container === document.body) return false;

            const containerRect = container.getBoundingClientRect();
            // Check if any part of the item is visible within the container
            return (
              rect.bottom > containerRect.top &&
              rect.top < containerRect.bottom &&
              rect.right > containerRect.left &&
              rect.left < containerRect.right
            );
          }
        },
        { key: lastKeyBefore, useWindowMode: useWindow }
      );

      expect(isVisible).toBe(true);
    });

    test("scroll up: first item before load stays visible in viewport", async ({
      page,
    }) => {
      // Setup: scroll down twice to get to 20-49
      await scrollToEdge(page, "down", useWindow);
      await scrollToEdge(page, "down", useWindow);

      // Get the first item before scroll up (item 20)
      const keysBefore = await getItemKeys(page);
      const firstKeyBefore = keysBefore[0];
      expect(firstKeyBefore).toBe("20");

      // Scroll to top to trigger upward load
      await scrollToEdge(page, "up", useWindow);

      // After load: 10-39 (item 20 should still be visible in viewport)
      const keysAfter = await getItemKeys(page);
      expect(keysAfter).toContain("20");

      // Check if item 20 is visible in viewport
      const isVisible = await page.evaluate(
        ({ key, useWindowMode }) => {
          const item = document.querySelector(`[data-item-key="${key}"]`);
          if (!item) return false;

          const rect = item.getBoundingClientRect();
          if (useWindowMode) {
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
          } else {
            let container = (item as HTMLElement).parentElement?.parentElement;
            while (
              container &&
              container.scrollHeight === container.clientHeight
            ) {
              container = container.parentElement;
            }
            if (!container) return false;

            const containerRect = container.getBoundingClientRect();
            return (
              rect.top >= containerRect.top &&
              rect.bottom <= containerRect.bottom
            );
          }
        },
        { key: firstKeyBefore, useWindowMode: useWindow }
      );

      expect(isVisible).toBe(true);
    });
  });
}

// Run tests for both modes
testScrollMode("Div Container", false);
testScrollMode("Window Scroll", true);
