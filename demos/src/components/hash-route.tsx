import React, { useEffect, useState } from "react";

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={`#${to}`} className={className}>
      {children}
    </a>
  );
}

export function parseHash() {
  const raw = window.location.hash.slice(1) || "/";
  const [path, queryString = ""] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(queryString));
  return { path, query };
}
