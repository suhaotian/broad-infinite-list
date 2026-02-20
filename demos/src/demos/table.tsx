"use client";
import { useState, useRef, Fragment } from "react";
import BidirectionalList, {
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

const VIEW_COUNT = 30;
const PAGE_SIZE = 20;

function MyTableList() {
  const [items, setItems] = useState<NewsItem[]>(
    NEWS_BY_RECENCY.slice(0, VIEW_COUNT)
  );

  const newestLoaded = items[0]?.id ?? 0;
  const oldestLoaded = items[items.length - 1]?.id ?? ALL_NEWS.length + 1;
  const hasPrevious = newestLoaded < ALL_NEWS.length;
  const hasNext = oldestLoaded > 1;

  const handleLoadMore: BidirectionalListProps<NewsItem>["onLoadMore"] = async (
    direction,
    refItem
  ) => {
    await new Promise((r) => setTimeout(r, 1000));
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
    setItems(NEWS_BY_RECENCY.slice(0, VIEW_COUNT));
    listRef.current?.scrollToTop();
  };

  return (
    <>
      <BidirectionalList<NewsItem>
        className="w-full"
        containerAs={"table"}
        as="tbody"
        itemAs={"tr"}
        ref={listRef}
        items={items}
        itemKey={(item) => item.id.toString()}
        itemClassName={(item) => `border-b`}
        itemStyle={(item) => ({
          minHeight: 100,
          padding: 16 + item.id * 0.000035,
          borderBottom: "1px solid #ddd",
          backgroundColor: item.id % 2 === 0 ? "#eee" : "#f5f6f7",
        })}
        spinnerRow={
          <div className="p-4 flex justify-center">
            <Spinner />
          </div>
        }
        renderItem={(item) => (
          <>
            <td style={{ fontWeight: 600, padding: 30 }}>{item.title}</td>
            <td style={{ fontSize: 12, color: "#666", padding: 30 }}>
              {item.category}
            </td>
          </>
        )}
        headerSlot={({ children }) => (
          <thead>
            <tr>
              <th colSpan={2}>{children}</th>
            </tr>
          </thead>
        )}
        footerSlot={({ children }) => (
          <tfoot>
            <tr>
              <td colSpan={2}>{children}</td>
            </tr>
          </tfoot>
        )}
        onLoadMore={handleLoadMore}
        onItemsChange={setItems}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        viewCount={VIEW_COUNT}
        useWindow={true}
        threshold={10}
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

export default MyTableList;
