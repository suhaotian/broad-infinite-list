import { useState } from "react";
import { NewsFeedDemo } from "./news-feed";
import { ChatDemo } from "./chat";
import { LogsDemo } from "./logs-stream";
import ChatGPTClaude from "./chatgpt-claude/demo";

import { Github, ExternalLink, Package, HandHelping } from "lucide-react";
import E2EDemo from "./e2e";

window.onerror = (e) => {
  alert(e);
};

const links = (
  <>
    <a
      href="https://github.com/suhaotian/broad-infinite-list"
      className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-black transition-colors">
      <Github size={18} />
      GitHub
    </a>
    <a
      href="https://npmjs.com/package/broad-infinite-list"
      className="flex items-center gap-2 text-sm font-bold text-red-400 hover:text-red-600 transition-colors">
      <Package size={18} />
      NPM
    </a>
  </>
);

export default function Demos() {
  const [tab] = useState<
    "news" | "logs" | "chat" | "e2e" | "chatgpt" | "claude"
  >(() => {
    return typeof document !== "undefined"
      ? ((new URL(location.href).searchParams?.get("demo") || "chat") as "chat")
      : "chat";
  });

  const sourceFiles = {
    news: "news-feed.tsx",
    logs: "logs-stream.tsx",
    chat: "chat.tsx",
    chatgpt: "chatgpt/demo.tsx",
    claude: "claude/demo.tsx",
  };

  if (tab === "e2e") {
    return <E2EDemo />;
  }
  if (tab === "chatgpt") {
    return (
      <div className="flex flex-col h-screen h-[100dvh] relative">
        <ChatGPTClaude
          key="chatgpt"
          type="chatgpt"
          headerItem={
            <div className="flex space-x-6 items-center pr-2">{links}</div>
          }
        />
      </div>
    );
  }
  if (tab === "claude") {
    return (
      <div className="flex flex-col h-screen h-[100dvh] relative">
        <ChatGPTClaude
          key="claude"
          type="claude"
          headerItem={
            <div className="flex space-x-6 items-center pr-2">{links}</div>
          }
        />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-sky-100 text-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 min-h-[100dvh]">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-4xl font-black text-slate-900 leading-none tracking-tighter uppercase">
                Broad Infinite List
              </h1>
              {links}
            </div>
            <p className="text-slate-500 font-medium text-lg max-w-xl leading-relaxed">
              A high-performance, <strong>bidirectional infinite loader</strong>{" "}
              for React, React Native and Vue. Smoothly stream logs, feed
              updates, or chat history in both directions without layout shifts.
            </p>
          </div>

          <nav className="flex p-1.5 bg-slate-200/60 backdrop-blur-sm rounded-2xl gap-1 shrink-0">
            {(["chat", "news", "logs", "chatgpt", "claude"] as const).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => {
                    location.href = location.pathname + "?demo=" + t;
                  }}
                  className={`px-3 md:px-1 py-2.5 md:py-2 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all ${
                    tab === t
                      ? "bg-white text-sky-600 shadow-md scale-105"
                      : "text-slate-500 hover:text-slate-800"
                  }`}>
                  {t}
                </button>
              )
            )}
          </nav>
        </header>

        {/* Demo Stage */}
        <main className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="md:absolute md:-top-12 md:right-0 mb-6 md:mb-0">
            <a
              href={`https://github.com/suhaotian/broad-infinite-list/blob/main/demos/src/demos/${sourceFiles[tab]}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter text-sky-400 hover:text-sky-600 transition-colors">
              <ExternalLink size={12} />
              View Demo Source
            </a>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60">
            {tab === "news" && <NewsFeedDemo />}
            {tab === "logs" && <LogsDemo />}
            {tab === "chat" && <ChatDemo />}
          </div>
        </main>
        {renderFooter()}
      </div>
    </div>
  );
}

const renderFooter = () => {
  return (
    <footer className="text-center pt-8 flex flex-col justify-center items-center space-y-6">
      <div className="flex md:flex-row md:space-x-4 flex-col space-y-6 md:space-y-0 justify-center items-center">
        {links}
        <a
          href="https://bundlejs.com/?q=broad-infinite-list%2Freact&treeshake=%5B*%5D&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react-dom%22%2C%22react%2Fjsx-runtime%22%5D%7D%7D"
          target="_blank"
          rel="noreferrer">
          <img
            src="https://deno.bundlejs.com/badge?q=broad-infinite-list/react&treeshake=[{default}]&config={%22esbuild%22:{%22external%22:[%22react%22,%22react-dom%22,%22react/jsx-runtime%22]}}"
            alt="Package size for library broad-infinite-list"
            className="rounded"
          />
        </a>
        <a href="https://www.jsdocs.io/package/broad-infinite-list">
          <img
            src="https://img.shields.io/badge/jsDocs.io-reference-blue"
            alt="jsDocs.io"
          />
        </a>
        <a
          href="https://github.com/suhaotian/broad-infinite-list/issues"
          className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
          <HandHelping size={18} />
          Any questions? Create issue.
        </a>
      </div>
      <div className="flex md:flex-row md:space-x-4 flex-col space-y-6 md:space-y-0 justify-center items-center">
        <span className="text-sm text-slate-600">
          You May Be Also Interested In:
        </span>
        <a
          href="https://npmjs.com/suhaotian/xior"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm font-bold text-sky-500 hover:text-sky-700 transition-colors">
          Xior
        </a>
        <a
          href="https://github.com/tsdk-monorepo/tsdk"
          className="flex items-center gap-2 text-sm font-bold text-amber-500 hover:text-amber-700 transition-colors">
          Tsdk
        </a>
      </div>
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
        Built for performance. Optimized for UX.
      </p>
    </footer>
  );
};
