import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Share2,
  Bookmark,
  Heart,
  MessageCircle,
  Clock,
  Calendar,
  ChevronRight,
  Facebook,
  Twitter,
  Linkedin,
  Copy,
} from "lucide-react";
import { Link } from "@/components/hash-route";

const DetailPage = ({ title }: { title: string }) => {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(999);
  const [readingProgress, setReadingProgress] = useState(0);

  // Track scroll progress for the top indicator
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setReadingProgress(progress);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
  };

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked);
  };

  // Content with Placeholders and Generic Text
  const article = {
    category: "Generic Category",
    title,
    subtitle:
      "This is a secondary description or subtitle intended to provide context and detail for the reader before diving into the main content.",
    author: "Firstname Lastname",
    role: "Senior Contributor",
    date: "January 01, 2026",
    readTime: "10 min read",
    mainImage:
      "https://placehold.co/1600x900/e2e8f0/475569?text=Main+Article+Image+16:9",
    sections: [
      {
        type: "paragraph",
        content:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
      },
      {
        type: "subheading",
        content: "Section Heading One",
      },
      {
        type: "paragraph",
        content:
          "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.",
      },
      {
        type: "quote",
        content:
          "This is a placeholder for a pull-quote. It is designed to stand out and break the visual flow of the text.",
        source: "Source Name, Position",
      },
      {
        type: "paragraph",
        content:
          "Integer vitae libero ac risus egestas placerat. Phasellus blandit leo ut odio. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Fusce id purus. Ut varius tincidunt libero.",
      },
      {
        type: "image",
        url: "https://placehold.co/1200x600/f1f5f9/64748b?text=In-Content+Visual+Asset",
        caption: "Placeholder caption text for the in-content image component.",
      },
      {
        type: "subheading",
        content: "Section Heading Two",
      },
      {
        type: "paragraph",
        content:
          "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.",
      },
      {
        type: "paragraph",
        content:
          "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.",
      },
      {
        type: "paragraph",
        content:
          "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100">
      {/* Progress Indicator */}
      <div
        className="fixed top-0 left-0 h-1 bg-blue-600 z-50 transition-all duration-150"
        style={{ width: `${readingProgress}%` }}
      />

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3 sm:px-8 flex items-center justify-between">
        <Link to="/">
          <button className="p-2 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2 group">
            <ArrowLeft
              size={18}
              className="group-hover:-translate-x-1 transition-transform"
            />
            <span className="hidden sm:inline font-semibold text-sm">
              Return
            </span>
          </button>
        </Link>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleBookmark}
            className={`p-2.5 rounded-lg transition-all ${
              isBookmarked
                ? "text-blue-600 bg-blue-50"
                : "hover:bg-slate-50 text-slate-400"
            }`}>
            <Bookmark size={18} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          <button className="p-2.5 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto pt-10 pb-24 px-5">
        {/* Header Metadata */}
        <div className="mb-10">
          <span className="text-blue-600 text-xs font-bold uppercase tracking-widest mb-4 block">
            {article.category}
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 leading-[1.15] mb-6">
            {article.title}
          </h1>
          <p className="text-lg sm:text-xl text-slate-500 leading-relaxed font-medium">
            {article.subtitle}
          </p>

          <div className="mt-10 flex items-center justify-between py-6 border-y border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden">
                <img
                  src="https://placehold.co/100x100/CBD5E1/FFFFFF?text=AV"
                  alt="Author"
                />
              </div>
              <div className="text-sm">
                <p className="font-bold text-slate-900">{article.author}</p>
                <p className="text-slate-400">{article.role}</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-tighter">
              <span className="flex items-center gap-1">
                <Calendar size={14} /> {article.date}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} /> {article.readTime}
              </span>
            </div>
          </div>
        </div>

        {/* Hero Image */}
        <div className="aspect-[16/9] w-full mb-12 rounded-xl overflow-hidden bg-slate-100 shadow-inner">
          <img
            src={article.mainImage}
            alt="Placeholder Hero"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Body Content */}
        <article className="max-w-none">
          {article.sections.map((section, idx) => {
            if (section.type === "paragraph") {
              return (
                <p
                  key={idx}
                  className="text-slate-700 text-lg leading-relaxed mb-6">
                  {section.content}
                </p>
              );
            }
            if (section.type === "subheading") {
              return (
                <h2
                  key={idx}
                  className="text-2xl font-black text-slate-900 mt-12 mb-5">
                  {section.content}
                </h2>
              );
            }
            if (section.type === "quote") {
              return (
                <div
                  key={idx}
                  className="my-12 px-8 py-2 border-l-4 border-blue-600">
                  <p className="text-2xl font-serif italic text-slate-800 mb-2 leading-snug">
                    "{section.content}"
                  </p>
                  <p className="text-sm font-bold text-blue-600">
                    — {section.source}
                  </p>
                </div>
              );
            }
            if (section.type === "image") {
              return (
                <figure key={idx} className="my-12">
                  <img
                    src={section.url}
                    alt="Content"
                    className="w-full rounded-xl border border-slate-100"
                  />
                  <figcaption className="text-center text-xs text-slate-400 mt-4 uppercase tracking-widest font-bold">
                    {section.caption}
                  </figcaption>
                </figure>
              );
            }
            return null;
          })}
        </article>

        {/* Footer Actions */}
        <div className="mt-16 pt-10 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <button
              onClick={handleLike}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold transition-all border ${
                isLiked
                  ? "bg-rose-50 border-rose-100 text-rose-500 scale-105 shadow-sm"
                  : "bg-white border-slate-200 text-slate-500 hover:border-rose-200"
              }`}>
              <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
              <span>{likeCount}</span>
            </button>
            <button className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:border-blue-200 font-bold transition-all">
              <MessageCircle size={18} />
              <span>Comments</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {[Twitter, Facebook, Linkedin, Copy].map((Icon, i) => (
              <button
                key={i}
                className="p-3 bg-slate-50 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>

        {/* Related Stories */}
        <div className="mt-24">
          <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-2">
            Related Content <ChevronRight size={20} className="text-blue-600" />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
            {[1, 2].map((i) => (
              <div key={i} className="group cursor-pointer">
                <div className="aspect-[4/3] rounded-xl overflow-hidden mb-4 bg-slate-100 border border-slate-100">
                  <img
                    src={`https://placehold.co/600x450/f8fafc/94a3b8?text=Related+Image+${i}`}
                    alt="Related"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <p className="text-blue-600 text-[10px] font-black uppercase tracking-widest mb-2">
                  Category
                </p>
                <h4 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                  Generic Secondary Article Headline for Layout Testing Purposes
                </h4>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="bg-slate-50 border-t border-slate-100 py-16 px-6">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <div className="text-xl font-black tracking-tighter text-slate-900 mb-8">
            LOGO_PLACEHOLDER
          </div>
          <div className="flex gap-8 text-slate-400 text-xs font-bold uppercase tracking-widest mb-10">
            <Link to="/" className="hover:text-blue-600">
              Privacy
            </Link>
            <Link to="/" className="hover:text-blue-600">
              Terms
            </Link>
            <Link to="/" className="hover:text-blue-600">
              About
            </Link>
          </div>
          <p className="text-slate-300 text-[10px] font-medium">
            © 2026 ORGANISATION NAME. ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default DetailPage;
