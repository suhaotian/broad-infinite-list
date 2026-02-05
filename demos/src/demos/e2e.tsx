"use client";

import type { LoadDirection } from "broad-infinite-list/react";
import BidirectionalList from "broad-infinite-list/react";
import { useState, useCallback, type ReactNode } from "react";
import { Node } from "./node";

// =============================================================================
// Spinner
// =============================================================================

function Spinner(): ReactNode {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        border: "2.5px solid #e2e8f0",
        borderTop: "2.5px solid #6366f1",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
      }}
    />
  );
}

interface DemoItem {
  id: number;
  title: string;
  body: string;
}

const TOTAL_ITEMS = 2000;
const VIEW_COUNT = 30;
const PAGE_SIZE = 10;
const SIMULATED_LATENCY_MS = 600;

const WORDS: readonly string[] = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
  "Iota",
  "Kappa",
] as const;

function generateItem(id: number): DemoItem {
  // Deterministic content per id — items won't flicker on re-render.
  const w = (i: number): string =>
    WORDS[
      (((id * 7 + i * 13) % WORDS.length) + WORDS.length) % WORDS.length
    ] as string;
  return {
    id,
    title: `Item #${id}`,
    body: `${w(0)} ${w(1)} ${w(2)} — sequence ${id % 50} of batch ${Math.floor(
      id / 50
    )}`,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getInitialPage(count: number): DemoItem[] {
  return Array.from({ length: count }, (_: unknown, i: number) =>
    generateItem(i)
  );
}

async function fetchPage(
  direction: LoadDirection,
  referenceItem: DemoItem
): Promise<DemoItem[]> {
  await delay(SIMULATED_LATENCY_MS);

  let start: number;
  let end: number;

  if (direction === "up") {
    end = referenceItem.id;
    start = Math.max(0, end - PAGE_SIZE);
  } else {
    start = referenceItem.id + 1;
    end = Math.min(TOTAL_ITEMS, start + PAGE_SIZE);
  }

  if (start >= end) return [];
  return Array.from({ length: end - start }, (_: unknown, i: number) =>
    generateItem(start + i)
  );
}

function computeBounds(items: DemoItem[]): {
  hasPrevious: boolean;
  hasNext: boolean;
} {
  if (items.length === 0) return { hasPrevious: false, hasNext: false };
  return {
    hasPrevious: (items[0]?.id as number) > 0,
    hasNext: (items[items.length - 1]?.id as number) < TOTAL_ITEMS - 1,
  };
}

// =============================================================================
// ListDemo — owns state for one BidirectionalList instance
// =============================================================================

function ListDemo({ useWindow }: { useWindow: boolean }): ReactNode {
  const [items, setItems] = useState<DemoItem[]>(() => getInitialPage(30));
  const { hasPrevious, hasNext } = computeBounds(items);

  // Stable callback — fetchPage is a module-level pure function so no deps.
  const handleLoadMore = useCallback(
    (direction: LoadDirection, referenceItem: DemoItem): Promise<DemoItem[]> =>
      fetchPage(direction, referenceItem),
    []
  );

  return (
    <BidirectionalList<DemoItem>
      items={items}
      itemKey={(item): string => String(item.id)}
      renderItem={(item): ReactNode => <ItemCard item={item} />}
      onLoadMore={handleLoadMore}
      onItemsChange={setItems}
      spinnerRow={
        <div className="flex justify-center items-center h-16">
          <Spinner />
        </div>
      }
      viewCount={VIEW_COUNT}
      threshold={200}
      useWindow={useWindow}
      hasPrevious={hasPrevious}
      hasNext={hasNext}
      emptyState="No items"
    />
  );
}

// =============================================================================
// ItemCard
// =============================================================================

function ItemCard({ item }: { item: DemoItem }): ReactNode {
  // Colour band keyed to id for quick visual scanning while scrolling.
  const hue = (item.id * 137) % 360;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 20px",
        borderBottom: "1px solid #1e293b",
        background: "#0f172a",
      }}>
      <div
        style={{
          width: 4,
          minHeight: 40,
          borderRadius: 2,
          background: `hsl(${hue}, 70%, 60%)`,
          flexShrink: 0,
          marginTop: 2,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#f1f5f9",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            letterSpacing: "0.02em",
          }}>
          {item.title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#64748b",
            marginTop: 3,
            fontFamily: "'Inter', sans-serif",
          }}>
          {item.body}
        </div>
      </div>
      <div style={{ width: 15, height: 15, overflow: "hidden", opacity: 0 }}>
        <Node depth={1} maxDepth={3} childrenCount={5} />
      </div>
    </div>
  );
}

type TabId = "container" | "window";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "container", label: "Div Container", icon: "⬜" },
  { id: "window", label: "Window Scroll", icon: "🪟" },
];

export default function E2ETests(): ReactNode {
  const [activeTab, setActiveTab] = useState<TabId>("container");
  const isWindowMode = activeTab === "window";

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #0f172a;
          color: #cbd5e1;
          font-family: 'Inter', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: isWindowMode ? undefined : "100dvh",
          minHeight: isWindowMode ? "100dvh" : undefined,
        }}>
        {/* Header */}
        <div
          style={{
            background: "#1e293b",
            borderBottom: "1px solid #334155",
            padding: "16px 24px",
            flexShrink: 0,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}>
          <div
            style={{
              maxWidth: 680,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                  letterSpacing: "0.04em",
                }}>
                BidirectionalList
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {TOTAL_ITEMS} items · pages of {PAGE_SIZE} · max window {30}
              </div>
            </div>

            {/* Tab switcher */}
            <div
              style={{
                display: "flex",
                background: "#0f172a",
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={(): void => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "'Inter', sans-serif",
                    transition: "all 0.15s ease",
                    background:
                      activeTab === tab.id ? "#6366f1" : "transparent",
                    color: activeTab === tab.id ? "#fff" : "#64748b",
                  }}>
                  <span style={{ fontSize: 14 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List area */}
        <div
          style={{
            flex: 1,
            maxWidth: 680,
            margin: "0 auto",
            width: "100%",
            padding: "0 24px",
            ...(isWindowMode
              ? { paddingBottom: 40 }
              : {
                  display: "flex",
                  flexDirection: "column" as const,
                  minHeight: 0,
                }),
          }}>
          {/* Keyed on activeTab so each mode remounts fresh */}
          <div
            key={activeTab}
            style={isWindowMode ? {} : { flex: 1, minHeight: 0 }}>
            <ListDemo useWindow={isWindowMode} key={isWindowMode ? 1 : 2} />
          </div>
        </div>
      </div>
    </>
  );
}
