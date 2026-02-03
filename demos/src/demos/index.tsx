import { useState } from "react";
import { NewsFeedDemo } from "./news-feed";
import { ChatDemo } from "./chat";
import { LogsDemo } from "./logs-stream";
import {
  Github,
  ExternalLink,
  Package,
  CircleQuestionMark,
} from "lucide-react"; // Assuming Lucide for icons

window.onerror = (e) => {
  alert(e);
};

export default function Demos() {
  const [tab, setTab] = useState<"news" | "logs" | "chat">(() => {
    return typeof document !== "undefined"
      ? ((new URL(location.href).searchParams?.get("demo") || "chat") as "chat")
      : "chat";
  });

  const sourceFiles = {
    news: "news-feed.tsx",
    logs: "logs-stream.tsx",
    chat: "chat.tsx",
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
  return (
    <div className="min-h-screen min-h-[100dvh]! bg-slate-50 font-sans selection:bg-sky-100 text-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
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
              for React. Smoothly stream logs, feed updates, or chat history in
              both directions without layout shifts.
            </p>
          </div>

          <nav className="flex p-1.5 bg-slate-200/60 backdrop-blur-sm rounded-2xl gap-1 shrink-0">
            {(["chat", "news", "logs"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                  tab === t
                    ? "bg-white text-sky-600 shadow-md scale-105"
                    : "text-slate-500 hover:text-slate-800"
                }`}>
                {t}
              </button>
            ))}
          </nav>
        </header>

        {/* Demo Stage */}
        <main className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="md:absolute md:-top-12 md:right-0 mb-6 md:mb-0">
            <a
              href={`https://github.com/suhaotian/broad-infinite-list/blob/main/demos/${sourceFiles[tab]}`}
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

        <footer className="text-center pt-8 flex flex-col justify-center items-center space-y-6">
          <div className="flex md:flex-row md:space-x-4 flex-col space-y-6 md:space-y-0 justify-center items-center">
            {links}
            <a
              href="https://npmjs.com/package/broad-infinite-list"
              target="_blank"
              rel="noreferrer">
              <img
                src="https://img.shields.io/bundlephobia/minzip/broad-infinite-list?label=size&color=sky&style=flat-square"
                alt="Package size for library broad-infinite-list"
                className="rounded"
              />
            </a>
            <a
              href="https://github.com/suhaotian/broad-infinite-list/issues"
              className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
              <CircleQuestionMark size={18} />
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
              className="flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-600 transition-colors">
              Xior
            </a>
            <a
              href="https://github.com/tsdk-monorepo/tsdk"
              className="flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-600 transition-colors">
              Tsdk
            </a>
          </div>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
            Built for performance. Optimized for UX.
          </p>
        </footer>
      </div>
    </div>
  );
}
