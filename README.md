# [Broad Infinite List](https://suhaotian.github.io/broad-infinite-list/) &middot; [![Size](https://deno.bundlejs.com/badge?q=broad-infinite-list@&badge=detailed)](https://bundlejs.com/?q=broad-infinite-list) [![npm version](https://img.shields.io/npm/v/broad-infinite-list.svg?style=flat)](https://www.npmjs.com/package/broad-infinite-list) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/suhaotian/broad-infinite-list/pulls) [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/suhaotian/broad-infinite-list/blob/main/LICENSE) ![typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label&color=blue)

**broad-infinite-list** is a tiny component that renders large lists efficiently by showing only a limited range of items. No need to configure each row’s height or use fixed row heights. It is suitable for chat message lists, news feed lists, and stream logs.

## Features

- 🔄 Bidirectional infinite scrolling
- ⚡ High performance - only renders fixed items
- 📏 Dynamic heights - no configuration needed
- 🪟 Window or container scrolling

## Demos

- Chat Messages [Demo](https://suhaotian.github.io/broad-infinite-list?demo=chat)
- News feed [Demo](https://suhaotian.github.io/broad-infinite-list?demo=news)
- Logs [Demo](https://suhaotian.github.io/broad-infinite-list?demo=logs)

**How It Works**

Define a fixed window of visible items (e.g., 30 entries from a 100,000-record dataset). Load items entering the viewport as the user scrolls, and remove items leaving the viewport. This keeps rendered items constant and maintains smooth performance with large datasets.

![how-it-works-chart](./flow.svg)

## Installation

```bash
npm install broad-infinite-list
```

## Quick Start

> [!TIP]
> Copy and paste the demo code, then run it.

```tsx
"use client";
import { useState, useRef } from "react";
import {
  BidirectionalList,
  type BidirectionalListProps,
  type BidirectionalListRef,
} from "broad-infinite-list/react";

interface NewsItem {
  id: number;
  title: string;
  category: string;
  timestamp: number;
}

const CATEGORIES = ["Tech", "Science", "Politics", "Business"];
const TITLES = [
  "Senate Passes Landmark Infrastructure Bill",
  "New AI Model Achieves Human-Level Performance",
  "Global Temperatures Record Highest Monthly Average",
  "Startup Raises $200M Series C for Autonomous Systems",
];

const TOTAL = 1000000;
const ALL_NEWS: NewsItem[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  title: `${i + 1}. ${TITLES[i % TITLES.length] || ""}`,
  category: CATEGORIES[i % CATEGORIES.length] || "",
  timestamp: Date.now() - (TOTAL - i) * 3600000,
}));

const NEWS_BY_RECENCY = [...ALL_NEWS].reverse();

const VIEW_SIZE = 50;
const PAGE_SIZE = 20;

function MyList() {
  const [items, setItems] = useState<NewsItem[]>(
    NEWS_BY_RECENCY.slice(0, VIEW_SIZE)
  );

  const newestLoaded = items[0]?.id ?? 0;
  const oldestLoaded = items[items.length - 1]?.id ?? ALL_NEWS.length + 1;
  const hasPrevious = newestLoaded < ALL_NEWS.length;
  const hasNext = oldestLoaded > 1;

  const handleLoadMore: BidirectionalListProps<NewsItem>["onLoadMore"] = async (
    direction,
    refItem
  ) => {
    await new Promise((r) => setTimeout(r, 200));
    const idx = NEWS_BY_RECENCY.findIndex((n) => n.id === refItem.id);
    if (direction === "down") {
      return NEWS_BY_RECENCY.slice(idx + 1, idx + PAGE_SIZE + 1);
    } else {
      return NEWS_BY_RECENCY.slice(idx - PAGE_SIZE, idx);
    }
  };

  const listRef = useRef<BidirectionalListRef>(null);
  const showScrollTopButton = items?.[0]?.id !== NEWS_BY_RECENCY[0]?.id;
  const onScrollToFirst = () => {
    setItems(NEWS_BY_RECENCY.slice(0, VIEW_SIZE));
    listRef.current?.scrollToTop();
  };

  return (
    <>
      <BidirectionalList<NewsItem>
        ref={listRef}
        items={items}
        itemKey={(item) => item.id.toString()}
        spinnerRow={
          <div className="p-4 flex justify-center">
            <Spinner />
          </div>
        }
        renderItem={(item) => (
          <div
            style={{
              padding: 16 + item.id * 0.000035,
              borderBottom: "1px solid #ddd",
              backgroundColor: item.id % 2 === 0 ? "#eee" : "#f5f6f7",
            }}>
            <div style={{ fontWeight: 600 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: "#666" }}>{item.category}</div>
          </div>
        )}
        onLoadMore={handleLoadMore}
        onItemsChange={setItems}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        viewSize={VIEW_SIZE}
        useWindow={true}
      />
      <button
        id="scrollToTopBtn"
        onClick={onScrollToFirst}
        className={
          "fixed bottom-5 right-5 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-opacity z-9 " +
          (showScrollTopButton
            ? "opacity-100"
            : "opacity-0 pointer-events-none")
        }>
        ↑
      </button>
      <div className="fixed z-9 top-5 p-2 text-xs right-5 rounded-xl shadow-lg bg-slate-200/55">
        <p>Total: {TOTAL}(1million)</p>
        <p>Display: {items.length}</p>
        <p>useWindow: {"true"}</p>
      </div>
    </>
  );
}

const Spinner = () => (
  <div className="size-6 border-2 border-slate-300 border-t-blue-400 rounded-full animate-spin" />
);

export default MyList;
```

## Support

If you find this project helpful, consider [buying me a coffee](https://github.com/suhaotian/broad-infinite-list/stargazers).

## Projects You May Also Be Interested In

- [xior](https://github.com/suhaotian/xior) - Tiny fetch library with plugins support and axios-like API
- [tsdk](https://github.com/tsdk-monorepo/tsdk) - Type-safe API development CLI tool for TypeScript projects
