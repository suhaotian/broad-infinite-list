import { useHashRoute, Link } from "../../components/hash-route";
import List from "./news-feed-list";
import Detail from "./news-feed-detail";

export default function NewsFeedIndex() {
  const { path, query } = useHashRoute();

  let content = <List />;
  if (path === "/detail") {
    content = <Detail title={query.title || ''} />;
  }

  return content;
}
