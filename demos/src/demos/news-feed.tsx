import BidirectionalList, {
  type BidirectionalListProps,
  type BidirectionalListRef,
} from "broad-infinite-list/react";
import { useState, useRef, useEffect } from "react";

export interface NewsItem {
  id: number;
  title: string;
  category: string;
  time: string;
}

const TOTAL_COUNT = 1e4;
const VIEW_COUNT = 50;
const PAGE_SIZE = 20;
const CATEGORIES = ["Tech", "Science", "Politics", "Business"];

const generateNews = (id: number): NewsItem => ({
  id,
  title: `Breaking: Article #${id} regarding ${
    CATEGORIES[id % CATEGORIES.length]
  }`,
  category: CATEGORIES[id % CATEGORIES.length] as string,
  time: new Date(
    Date.now() - (TOTAL_COUNT - id) * 3600000
  ).toLocaleTimeString(),
});
let ALL_NEWS: NewsItem[] = [];

export function NewsFeedDemo() {
  const [items, setItems] = useState<NewsItem[]>([]);

  useEffect(() => {
    ALL_NEWS = Array.from({ length: TOTAL_COUNT }, (_, i) => generateNews(i));
    ALL_NEWS.reverse();
    setItems(ALL_NEWS.slice(0, VIEW_COUNT));
  }, []);

  const handleLoadMore: BidirectionalListProps<NewsItem>["onLoadMore"] = async (
    direction,
    refItem
  ) => {
    await new Promise((r) => setTimeout(r, 200));
    const idx = ALL_NEWS.findIndex((n) => n.id === refItem.id);
    if (idx === -1) return [];

    if (direction === "down") {
      const end = Math.min(ALL_NEWS.length, idx + PAGE_SIZE + 1);
      return ALL_NEWS.slice(idx + 1, end);
    } else {
      const start = Math.max(0, idx - PAGE_SIZE);
      return ALL_NEWS.slice(start, idx);
    }
  };

  const hasPrevious = items.length > 0 && items[0]?.id !== ALL_NEWS[0]?.id;
  const hasNext =
    items.length > 0 &&
    items[items.length - 1]?.id !== ALL_NEWS[ALL_NEWS.length - 1]?.id;
  const listRef = useRef<BidirectionalListRef>(null);
  const showJump = items?.[0]?.id !== ALL_NEWS[0]?.id;
  const onJump = () => {
    setItems(ALL_NEWS.slice(0, VIEW_COUNT));
    listRef.current?.scrollToTop("instant");
  };
  const onScrollStart = () => {
    console.log("Start scroll");
  };
  const onScrollEnd = () => {
    console.log("Finish scroll");
  };

  return (
    <div className="relative">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur shadow-sm border-b border-gray-100 p-4 flex justify-between items-center">
        <h2 className="font-black text-xl tracking-tight text-slate-900">
          News Feed Demo
        </h2>
        <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-700">
          {TOTAL_COUNT.toLocaleString()} ARTICLES
        </span>
      </div>

      <BidirectionalList<NewsItem>
        ref={listRef}
        items={items}
        itemKey={(m) => m.id.toString()}
        useWindow={true}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        threshold={100}
        onLoadMore={handleLoadMore}
        onItemsChange={setItems}
        viewCount={VIEW_COUNT}
        spinnerRow={
          <div className="p-10 flex justify-center">
            <div className="size-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }
        renderItem={(item) => (
          <div className="p-8 border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
              {item.category}
            </span>
            <h3 className="text-xl font-bold mt-1 text-slate-800">
              {item.title}
            </h3>
            <p className="text-gray-400 text-sm mt-2 font-medium">
              Published {item.time}
            </p>
          </div>
        )}
        onScrollStart={onScrollStart}
        onScrollEnd={onScrollEnd}
      />

      {showJump && (
        <button
          onClick={onJump}
          className="fixed bottom-8 right-8 bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-4 active:scale-95 transition-transform">
          Go To Top ↑
        </button>
      )}
    </div>
  );
}
