import BidirectionalList, {
  type BidirectionalListProps,
  type BidirectionalListRef,
} from "broad-infinite-list/react";
import { useState, useRef, useEffect } from "react";

export interface ChatMessage {
  id: number;
  text: string;
  sender: "me" | "them";
  time: string;
}

const TOTAL_COUNT = 1e4;
const VIEW_SIZE = 50;
const PAGE_SIZE = 20;

const generateMessage = (id: number): ChatMessage => ({
  id,
  text:
    id % 5 === 0
      ? `Message #${id}: Can someone check the latest deploy?`
      : `Message #${id}: Checking the status of the server...`,
  sender: id % 2 === 0 ? "me" : "them",
  time: new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

let ALL_MESSAGES: ChatMessage[] = [];

export function ChatDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [disable, setDisable] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    ALL_MESSAGES = Array.from({ length: TOTAL_COUNT }, (_, i) =>
      generateMessage(i)
    );
    const messages = ALL_MESSAGES.slice(-VIEW_SIZE);
    setMessages(messages);
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToBottom("instant");
        setDisable(false);
      }, 100);
    }
  }, []);

  const handleLoadMore: BidirectionalListProps<ChatMessage>["onLoadMore"] =
    async (direction, refItem) => {
      await new Promise((r) => setTimeout(r, 200));

      const idx = ALL_MESSAGES.findIndex((m) => m.id === refItem.id);
      if (idx === -1) return [];

      if (direction === "up") {
        // load older messages
        const start = Math.max(0, idx - PAGE_SIZE);
        return ALL_MESSAGES.slice(start, idx);
      } else {
        // load newer messages
        const end = Math.min(ALL_MESSAGES.length, idx + PAGE_SIZE + 1);
        return ALL_MESSAGES.slice(idx + 1, end);
      }
    };

  const hasPrevious =
    messages.length > 0 && messages[0]?.id !== ALL_MESSAGES[0]?.id; // older exists
  const hasNext =
    messages.length > 0 &&
    messages?.[messages.length - 1]?.id !==
      ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id; // newer exists

  const listRef = useRef<BidirectionalListRef>(null);
  const showJump =
    messages?.[messages.length - 1]?.id !==
    ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id;
  const onJump = () => {
    setUnreadCount(0);
    setMessages(ALL_MESSAGES.slice(-VIEW_SIZE));
    setTimeout(() => listRef.current?.scrollToBottom("instant"), 50);
  };
  const onScrollStart = () => {
    console.log("Start scroll");
  };
  const onScrollEnd = () => {
    console.log("Finish scroll");
  };

  const sendMessage = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const lastItem = ALL_MESSAGES[ALL_MESSAGES.length - 1];
    const nextId =
      (typeof lastItem?.id === "number" ? lastItem.id : TOTAL_COUNT) + 1;
    const newMsg: ChatMessage = {
      id: nextId,
      text: inputValue,
      sender: "me",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    ALL_MESSAGES.push(newMsg); // Sync to database
    onJump();
    setInputValue("");
  };

  return (
    <div className="h-[650px] bg-white rounded-3xl border border-gray-200 flex flex-col overflow-hidden shadow-2xl relative">
      <div className="p-4 border-b border-black/10 bg-white/80 backdrop-blur sticky top-0 z-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md">
            JD
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-800">
              Project Channel
            </h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              History: {TOTAL_COUNT.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-green-500 font-bold tracking-widest flex items-center gap-1">
            <span className="size-1.5 bg-green-500 rounded-full animate-pulse" />{" "}
            ONLINE
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-slate-50">
        <BidirectionalList<ChatMessage>
          ref={listRef}
          items={messages}
          itemKey={(m) => m.id.toString()}
          useWindow={false}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          viewSize={VIEW_SIZE}
          threshold={100}
          onLoadMore={handleLoadMore}
          onItemsChange={setMessages}
          spinnerRow={
            <div className="p-4 flex justify-center">
              <div className="size-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          }
          renderItem={(m) => (
            <div
              className={`flex p-2 px-4 ${
                m.sender === "me" ? "justify-end" : "justify-start"
              }`}>
              <div
                className={`max-w-[80%] p-3 rounded-2xl shadow-sm text-sm ${
                  m.sender === "me"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-white text-gray-800 rounded-bl-none border border-gray-100"
                }`}>
                {m.text}
                <span
                  className={`block text-[9px] mt-1 text-right uppercase font-bold tracking-tighter ${
                    m.sender === "me" ? "text-blue-200" : "text-gray-300"
                  }`}>
                  {m.time}
                </span>
              </div>
            </div>
          )}
          disable={disable}
          onScrollStart={onScrollStart}
          onScrollEnd={onScrollEnd}
        />
      </div>

      {showJump && (
        <button
          onClick={onJump}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-5 py-2.5 rounded-full font-bold text-xs shadow-xl flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all z-20 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2">
          {unreadCount > 0
            ? `New Messages (${unreadCount})`
            : "Scroll to Bottom"}{" "}
          ↓
        </button>
      )}

      <form
        onSubmit={sendMessage}
        className="p-4 bg-white border-t  border-black/10 flex gap-2 shrink-0">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-gray-100 rounded-full px-5 py-2 text-sm outline-none focus:ring-2 ring-blue-500 transition-all text-slate-700"
        />
        <button
          type="submit"
          className="size-10 bg-blue-600 rounded-full flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all shadow-md">
          <svg
            className="size-5 rotate-90"
            fill="currentColor"
            viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
          </svg>
        </button>
      </form>
    </div>
  );
}
