import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  User,
  Bot,
  Send,
  Paperclip,
  Sparkles,
  Copy,
  RotateCw,
  ArrowDown,
} from "lucide-react";
import BidirectionalList, {
  type BidirectionalListProps,
  type BidirectionalListRef,
} from "broad-infinite-list/react";

type Sender = "user" | "ai";
type InterfaceStyle = "chatgpt" | "claude";
type Theme = "light" | "dark";
type ScrollMode = "window" | "container";

interface Message {
  id: string;
  sender: Sender;
  text: string;
  timestamp: number;
}

const generateRandomMessages = (count: number): Message[] => {
  const snippets = [
    { type: "text", content: "The quick brown fox jumps over the lazy dog." },
    {
      type: "text",
      content:
        "I can certainly help with that. Here is a breakdown of the logic:",
    },
    {
      type: "code",
      lang: "python",
      content:
        "def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1",
    },
    {
      type: "text",
      content: "Please note that this function assumes the array is sorted.",
    },
    {
      type: "code",
      lang: "javascript",
      content:
        "const useEffect = (callback, deps) => {\n  const hasNoDeps = !deps;\n  const hasChangedDeps = deps ? !deps.every((el, i) => el === prevDeps[i]) : true;\n  if (hasNoDeps || hasChangedDeps) {\n    callback();\n    prevDeps = deps;\n  }\n};",
    },
    {
      type: "text",
      content:
        "Understanding the difference between microtasks and macrotasks is crucial for optimizing the event loop.",
    },
    {
      type: "text",
      content:
        "Here's a list of considerations:\n1. Scalability\n2. Maintainability\n3. Security",
    },
  ];

  const msgs: Message[] = [];

  for (let i = 0; i < count; i++) {
    const isUser = Math.random() > 0.5;
    if (isUser) {
      msgs.push({
        id: `msg-${i}`,
        sender: "user",
        text:
          snippets[0]?.content +
          (Math.random() > 0.7 ? " Can you explain why?" : ""),
        timestamp: Date.now() - (count - i) * 60000,
      });
    } else {
      const hasCode = Math.random() > 0.6;
      let text = "";
      if (hasCode) {
        text = `${snippets[1]?.content}\n\n\`\`\`${
          Math.random() > 0.5 ? "python" : "javascript"
        }\n${snippets[2]?.content}\n\`\`\`\n\n${snippets[3]?.content}`;
      } else {
        text =
          Math.random() > 0.5
            ? (snippets[5]?.content as string)
            : (snippets[6]?.content as string);
      }

      msgs.push({
        id: `msg-${i}`,
        sender: "ai",
        text,
        timestamp: Date.now() - (count - i) * 60000,
      });
    }
  }
  return msgs;
};

const TOTAL_COUNT = 1e4;
const VIEW_COUNT = 50;
const PAGE_SIZE = 20;

// 1. Hook for managing message data and pagination logic
const useMessageData = (totalMessages: number = TOTAL_COUNT) => {
  const [ALL_MESSAGES, setAllMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [disable, setDisable] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const listRef = useRef<BidirectionalListRef>(null);

  useEffect(() => {
    const ALL_MESSAGES = generateRandomMessages(totalMessages);
    const messages = ALL_MESSAGES.slice(-VIEW_COUNT);
    setAllMessages(ALL_MESSAGES);
    setMessages(messages);
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToBottom("instant");
        setDisable(false);
      }, 100);
    }
  }, []);

  const handleLoadMore: BidirectionalListProps<Message>["onLoadMore"] = async (
    direction,
    refItem
  ) => {
    await new Promise((r) => setTimeout(r, Math.random() * 1000));

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

  const showJump =
    messages?.[messages.length - 1]?.id !==
    ALL_MESSAGES[ALL_MESSAGES.length - 1]?.id;
  const handleJump = () => {
    setMessages(ALL_MESSAGES.slice(-VIEW_COUNT));
    setTimeout(() => listRef.current?.scrollToBottom("instant"), 50);
  };

  return {
    disable,
    messages,
    handleLoadMore,
    setMessages,
    hasPrevious,
    hasNext,
    listRef,
    showJump,
    handleJump,
  };
};

const MessageContent = ({
  text,
  isDark,
  style,
}: {
  text: string;
  isDark: boolean;
  style: InterfaceStyle;
}) => {
  const parts = text.split(/```(\w+)?\n([\s\S]*?)```/g);

  if (parts.length === 1) {
    return (
      <div className="whitespace-pre-wrap leading-relaxed break-words">
        {text}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {parts.map((part, index) => {
        if (index % 3 === 0) {
          if (!part.trim()) return null;
          return (
            <div key={index} className="whitespace-pre-wrap leading-relaxed">
              {part}
            </div>
          );
        }
        if (index % 3 === 1) return null;

        const lang = parts[index - 1] || "text";
        return (
          <div
            key={index}
            className={`rounded-md overflow-hidden my-2 font-mono text-sm ${
              isDark
                ? "bg-black/30 border border-white/10"
                : "bg-gray-100 border border-black/5"
            }`}>
            <div
              className={`flex items-center justify-between px-3 py-1.5 ${
                isDark
                  ? "bg-white/5 text-gray-400"
                  : "bg-gray-200 text-gray-600"
              }`}>
              <span className="text-xs font-semibold uppercase">{lang}</span>
              <div className="flex items-center gap-1 text-xs cursor-pointer hover:text-current">
                <Copy size={12} /> Copy
              </div>
            </div>
            <div className="p-3 overflow-x-auto">
              <code
                className={
                  style === "chatgpt"
                    ? isDark
                      ? "text-gray-100"
                      : "text-gray-800"
                    : isDark
                    ? "text-[#d1d1cf]"
                    : "text-[#3e3e3c]"
                }>
                {part}
              </code>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- Component 1: ChatGPT Interface ---

interface ChatComponentProps {
  isDark: boolean;
  theme: Theme;
  toggleTheme: () => void;
  scrollMode: ScrollMode;
  headerItem?: ReactNode;
}

const ChatGPTInterface: React.FC<ChatComponentProps> = ({
  isDark,
  theme,
  toggleTheme,
  scrollMode,
  headerItem,
}) => {
  const {
    disable,
    messages,
    setMessages,
    handleLoadMore,
    hasPrevious,
    hasNext,
    listRef,
    showJump,
    handleJump,
  } = useMessageData();
  const spinner = (
    <div
      className={`py-4 text-center flex justify-center items-center gap-2 ${
        isDark ? "text-gray-500" : "text-gray-400"
      }`}>
      <RotateCw className="animate-spin" size={16} />
      <span className="text-xs">Loading history...</span>
    </div>
  );
  return (
    <div
      className={`flex flex-col h-full ${
        scrollMode === "container" ? "overflow-hidden" : ""
      }`}>
      {/* Header */}
      <header
        className={`flex-none sticky top-0 z-50 flex items-center justify-between px-3 py-2 border-b transition-colors duration-200 ${
          isDark
            ? "bg-[#343541] border-white/10 text-gray-100"
            : "bg-white border-black/5 text-gray-800"
        }`}>
        <div className="flex items-center gap-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md px-2 py-2 transition-colors">
          <span className="font-semibold text-base">ChatGPT Demo</span>
        </div>
        <div>{headerItem}</div>
      </header>

      {/* Scrollable Area */}

      <div className={`flex-1 relative overflow-hidden`}>
        <BidirectionalList<Message>
          ref={listRef}
          items={messages}
          itemKey={(m) => m.id.toString()}
          useWindow={false}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          viewCount={VIEW_COUNT}
          threshold={200}
          onLoadMore={handleLoadMore}
          onItemsChange={setMessages}
          spinnerRow={spinner}
          disable={disable}
          renderItem={(msg) => {
            const isUser = msg.sender === "user";
            return (
              <div key={msg.id} className="w-full group">
                <div className="max-w-3xl mx-auto flex gap-4 p-4 md:py-6 text-base">
                  <div className="flex-shrink-0 flex flex-col relative items-end">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                        isUser
                          ? isDark
                            ? "bg-transparent border-white/20"
                            : "bg-transparent border-black/10"
                          : isDark
                          ? "bg-[#19c37d] border-transparent"
                          : "bg-[#10a37f] border-transparent"
                      }`}>
                      {isUser ? (
                        <User
                          size={16}
                          className={isDark ? "text-gray-300" : "text-gray-600"}
                        />
                      ) : (
                        <Bot size={18} className="text-white" />
                      )}
                    </div>
                  </div>
                  <div
                    className={`relative flex-1 overflow-hidden ${
                      isDark ? "text-gray-100" : "text-gray-800"
                    }`}>
                    <div className={`font-semibold mb-1 text-sm opacity-90`}>
                      {isUser ? "You" : "ChatGPT"}
                    </div>
                    <div className="prose dark:prose-invert max-w-none leading-7">
                      <MessageContent
                        text={msg.text}
                        isDark={isDark}
                        style="chatgpt"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      <div
        className={`flex-none relative w-full p-4 bg-gradient-to-t from-10% pointer-events-none ${
          isDark ? "from-[#343541] to-transparent" : "from-white to-transparent"
        }`}>
        <div className="max-w-3xl mx-auto relative pointer-events-auto">
          {/* Scroll Down Button */}
          {showJump && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={handleJump}
                className={`p-2 rounded-full shadow-md border opacity-80 hover:opacity-100 transition-all ${
                  isDark
                    ? "bg-[#444654] border-white/10 text-gray-200"
                    : "bg-white border-black/10 text-gray-600"
                }`}>
                <ArrowDown size={16} />
              </button>
            </div>
          )}

          <div
            className={`flex flex-col gap-2 p-3 rounded-2xl border shadow-sm overflow-hidden relative z-20 ${
              isDark
                ? "bg-[#40414f] border-black/30 text-white"
                : "bg-white border-black/10 text-gray-800"
            }`}>
            <textarea
              rows={1}
              placeholder="Message ChatGPT..."
              className="w-full max-h-[200px] bg-transparent border-none focus:ring-0 resize-none py-2 px-1 text-base placeholder:text-gray-400"
              style={{ minHeight: "24px" }}
            />
            <div className="flex justify-between items-center">
              <button className="p-2 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-black/20">
                <Paperclip size={18} />
              </button>
              <button
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark
                    ? "bg-white text-black disabled:bg-white/20"
                    : "bg-black text-white disabled:bg-black/20"
                }`}>
                <Send size={16} />
              </button>
            </div>
          </div>
          <div className="text-center text-xs text-gray-500 mt-2 font-light">
            ChatGPT can make mistakes. Consider checking important information.
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Component 2: Claude Interface ---

const ClaudeInterface: React.FC<ChatComponentProps> = ({
  isDark,
  theme,
  toggleTheme,
  scrollMode,
  headerItem,
}) => {
  const {
    disable,
    messages,
    setMessages,
    handleLoadMore,
    hasPrevious,
    hasNext,
    listRef,
    showJump,
    handleJump,
  } = useMessageData();

  const spinner = (
    <div
      className={`py-4 text-center flex justify-center items-center gap-2 ${
        isDark ? "text-gray-500" : "text-gray-400"
      }`}>
      <RotateCw className="animate-spin" size={16} />
      <span className="text-xs">Loading history...</span>
    </div>
  );
  return (
    <div
      className={`flex flex-col h-full ${
        scrollMode === "container" ? "overflow-hidden" : ""
      }`}>
      {/* Header */}
      <header
        className={`flex-none sticky top-0 z-50 flex items-center justify-between px-6 py-4 transition-colors duration-200 ${
          isDark ? "bg-[#1d1c1a] text-[#d1d1cf]" : "bg-[#f5f2e8] text-[#3e3e3c]"
        }`}>
        <div className="flex items-center gap-3 select-none">
          <div
            className={`p-1.5 rounded-lg ${
              isDark
                ? "bg-[#d09a73] shadow-[0_0_15px_rgba(208,154,115,0.3)]"
                : "bg-[#d97757] shadow-[0_0_10px_rgba(217,119,87,0.2)]"
            }`}>
            <Sparkles size={16} className="text-[#1d1c1a] fill-[#1d1c1a]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-2xl font-medium tracking-tight">
              Claude Demo
            </span>
          </div>
        </div>
        <div>{headerItem}</div>
      </header>

      {/* Scrollable Area */}
      <div className={`flex-1 relative overflow-hidden`}>
        <BidirectionalList<Message>
          ref={listRef}
          items={messages}
          itemKey={(m) => m.id.toString()}
          useWindow={false}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          viewCount={VIEW_COUNT}
          threshold={100}
          onLoadMore={handleLoadMore}
          onItemsChange={setMessages}
          spinnerRow={spinner}
          renderItem={(msg) => {
            const isUser = msg.sender === "user";
            return (
              <div key={msg.id} className="w-full py-6">
                <div className="max-w-[800px] mx-auto flex gap-6 px-4">
                  {/* Avatar Column */}
                  <div className="flex-shrink-0 pt-1">
                    {isUser ? (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium tracking-wide ${
                          isDark
                            ? "bg-[#3a3935] text-[#d1d1cf]"
                            : "bg-[#e6e3db] text-[#555]"
                        }`}>
                        US
                      </div>
                    ) : (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isDark ? "bg-[#d09a73]" : "bg-[#d97757]"
                        }`}>
                        <Sparkles
                          size={18}
                          className="text-[#1d1c1a] fill-[#1d1c1a]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Content Column */}
                  <div
                    className={`flex-1 font-sans text-[16px] leading-relaxed ${
                      isDark ? "text-[#e8e8e3]" : "text-[#2d2d2d]"
                    }`}>
                    <div
                      className={`font-semibold mb-2 text-sm tracking-wide ${
                        isDark ? "text-[#9fa09c]" : "text-gray-500"
                      }`}>
                      {isUser ? "User" : "Claude"}
                    </div>

                    <div className="claude-content">
                      <MessageContent
                        text={msg.text}
                        isDark={isDark}
                        style="claude"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
          disable={disable}
        />
      </div>

      <div
        className={`flex-none shrink-0 relative bottom-0 left-0 w-full pb-8 pt-6 px-4 pointer-events-none ${
          isDark
            ? "bg-gradient-to-t from-[#1d1c1a] via-[#1d1c1a] to-transparent"
            : "bg-gradient-to-t from-[#f5f2e8] via-[#f5f2e8] to-transparent"
        }`}>
        <div className="max-w-[800px] mx-auto relative pointer-events-auto">
          {/* Scroll Button */}
          {showJump && (
            <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={handleJump}
                className={`p-2 rounded-full shadow-md border opacity-80 hover:opacity-100 transition-all ${
                  isDark
                    ? "bg-[#2b2a27] border-[#3a3935] text-[#d09a73]"
                    : "bg-white border-[#d1d5db] text-[#d97757]"
                }`}>
                <ArrowDown size={16} />
              </button>
            </div>
          )}

          <div
            className={`relative flex flex-col rounded-2xl border shadow-sm transition-all duration-300 z-20 ${
              isDark
                ? "bg-[#2b2a27] border-[#3a3935] focus-within:border-[#d09a73] focus-within:shadow-[0_0_0_1px_#d09a73]"
                : "bg-white border-[#d1d5db] focus-within:border-[#d97757] focus-within:shadow-[0_0_0_1px_#d97757]"
            }`}>
            <textarea
              rows={1}
              placeholder="Reply to Claude..."
              className={`w-full bg-transparent border-none focus:ring-0 resize-none py-4 px-4 min-h-[56px] ${
                isDark
                  ? "text-[#e8e8e3] placeholder-gray-500"
                  : "text-gray-800 placeholder-gray-400"
              }`}
            />
            <div className="flex justify-between items-center px-3 pb-3">
              <div className="flex gap-2">
                <button
                  className={`p-2 rounded-lg transition-colors ${
                    isDark
                      ? "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                      : "text-gray-400 hover:bg-black/5 hover:text-gray-600"
                  }`}>
                  <Paperclip size={18} />
                </button>
              </div>
              <button
                className={`p-2 rounded-lg transition-all transform active:scale-95 ${
                  isDark
                    ? "bg-[#d09a73] text-[#1d1c1a] hover:bg-[#e0a980]"
                    : "bg-[#d97757] text-white hover:bg-[#e88666]"
                }`}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App({
  type,
  headerItem,
}: {
  type: InterfaceStyle;
  headerItem?: ReactNode;
}) {
  const [interfaceStyle, setInterfaceStyle] = useState<InterfaceStyle>(type);
  const [theme, setTheme] = useState<Theme>("light");
  const [scrollMode, setScrollMode] = useState<ScrollMode>("container");

  const isDark = theme === "dark";
  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === "light" ? "dark" : "light")),
    []
  );

  // Dynamic Background
  const bgStyle = useMemo(() => {
    if (interfaceStyle === "chatgpt")
      return isDark ? "bg-[#343541]" : "bg-white";
    if (interfaceStyle === "claude")
      return isDark ? "bg-[#1d1c1a]" : "bg-[#f5f2e8]";
    return "";
  }, [interfaceStyle, isDark]);

  return (
    <div
      className={`transition-colors duration-300 font-sans ${bgStyle} ${
        scrollMode === "window" ? "min-h-full" : "h-full overflow-hidden"
      }`}>
      {/* Conditional Rendering of Interface Components */}
      {interfaceStyle === "chatgpt" ? (
        <ChatGPTInterface
          isDark={isDark}
          theme={theme}
          toggleTheme={toggleTheme}
          scrollMode={scrollMode}
          headerItem={headerItem}
        />
      ) : (
        <ClaudeInterface
          isDark={isDark}
          theme={theme}
          toggleTheme={toggleTheme}
          scrollMode={scrollMode}
          headerItem={headerItem}
        />
      )}
    </div>
  );
}
