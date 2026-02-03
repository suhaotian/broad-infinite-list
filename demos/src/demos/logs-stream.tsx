import {
  BidirectionalList,
  type BidirectionalListProps,
  type BidirectionalListRef,
} from "broad-infinite-list/react";
import { useState, useRef, useEffect } from "react";

export interface LogEntry {
  id: number;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  msg: string;
  time: string;
}
const LOG_LEVELS: LogEntry["level"][] = ["INFO", "WARN", "ERROR", "DEBUG"];

const TOTAL_COUNT = 1e4;
const VIEW_SIZE = 100;
const PAGE_SIZE = 50;

const generateLog = (id: number): LogEntry => ({
  id,
  level: LOG_LEVELS[id % LOG_LEVELS.length] as "INFO",
  msg: `System process [PID:${1000 + (id % 500)}] reporting status code ${
    id % 200
  }`,
  time: new Date().toLocaleTimeString(),
});

let ALL_LOGS: LogEntry[] = [];

export function LogsDemo() {
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    return [];
  });
  const [disable, setDisable] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    ALL_LOGS = Array.from({ length: TOTAL_COUNT }, (_, i) => generateLog(i));
    const logs = ALL_LOGS.slice(-VIEW_SIZE);
    setLogs(() => {
      return logs;
    });
    if (logs.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToBottom("instant");
        setDisable(false);
      }, 100);
    }
  }, []);

  const handleLoadMore: BidirectionalListProps<LogEntry>["onLoadMore"] = async (
    direction,
    refItem
  ) => {
    await new Promise((r) => setTimeout(r, 300));

    const idx = ALL_LOGS.findIndex((m) => m.id === refItem.id);
    if (idx === -1) return [];

    if (direction === "up") {
      // load older logs
      const start = Math.max(0, idx - PAGE_SIZE);
      return ALL_LOGS.slice(start, idx);
    } else {
      // load newer logs
      const end = Math.min(ALL_LOGS.length, idx + PAGE_SIZE + 1);
      return ALL_LOGS.slice(idx + 1, end);
    }
  };

  const hasPrevious = logs.length > 0 && logs[0]?.id !== ALL_LOGS[0]?.id; // older exists
  const hasNext =
    logs.length > 0 &&
    logs?.[logs.length - 1]?.id !== ALL_LOGS[ALL_LOGS.length - 1]?.id; // newer exists

  const listRef = useRef<BidirectionalListRef>(null);
  const showJump =
    logs?.[logs.length - 1]?.id !== ALL_LOGS[ALL_LOGS.length - 1]?.id;
  const onJump = () => {
    setUnreadCount(0);
    setLogs(ALL_LOGS.slice(-VIEW_SIZE));
    setTimeout(() => listRef.current?.scrollToBottom("instant"), 50);
  };
  const onScrollStart = () => {
    console.log("Start scroll");
  };
  const onScrollEnd = () => {
    console.log("Finish scroll");
  };

  const pushNewLog = () => {
    const lastId = ALL_LOGS[ALL_LOGS.length - 1]?.id || TOTAL_COUNT;
    const nextLog = generateLog(lastId + 1);
    ALL_LOGS.push(nextLog); // Sync to database

    if (showJump) {
      setUnreadCount((c) => {
        return c + 1;
      });
    } else {
      setLogs((prev) => [...prev, nextLog]);
      onJump();
    }
  };

  return (
    <div className="h-[600px] bg-slate-950 rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl relative">
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
        <span className="text-xs font-mono text-slate-400 font-bold tracking-tighter">
          TERMINAL://LOG_SYSTEM
        </span>
        <button
          onClick={pushNewLog}
          className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-1 rounded font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-sm active:scale-95">
          Push New Log +
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <BidirectionalList<LogEntry>
          ref={listRef}
          items={logs}
          itemKey={(m) => m.id.toString()}
          useWindow={false}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          disable={disable}
          viewSize={VIEW_SIZE}
          onLoadMore={handleLoadMore}
          onItemsChange={setLogs}
          spinnerRow={
            <div className="p-4 flex justify-center">
              <div className="size-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          }
          renderItem={(l) => (
            <div className="px-4 py-0.5 font-mono text-[12px] flex gap-4 hover:bg-white/5 transition-colors group">
              <span className="text-slate-600 shrink-0">[{l.time}]</span>
              <span
                className={`shrink-0 w-12 font-bold ${
                  l.level === "ERROR"
                    ? "text-red-400"
                    : l.level === "WARN"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}>
                {l.level}
              </span>
              <span className="text-slate-300 group-hover:text-white transition-colors truncate">
                {l.msg}
              </span>
            </div>
          )}
          onScrollStart={onScrollStart}
          onScrollEnd={onScrollEnd}
        />
      </div>

      {showJump && (
        <button
          onClick={onJump}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-2.5 rounded-full font-bold text-xs shadow-xl animate-in fade-in slide-in-from-bottom-2 active:scale-95 transition-all whitespace-nowrap z-20 hover:bg-gray-100">
          {unreadCount > 0
            ? `Jump to Unread Logs (${unreadCount})`
            : "Scroll to Bottom"}{" "}
          ↓
        </button>
      )}
    </div>
  );
}
