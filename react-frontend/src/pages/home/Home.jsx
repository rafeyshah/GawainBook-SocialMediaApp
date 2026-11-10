import Layout from "../../components/layout/Layout";
import Feed from "../../components/feed/Feed";
import "../reading/reading.css";

// The general posts feed. Circles are the home screen (decision D9); the
// feed lives on its own tab for posts that don't belong to one circle.
export default function Home() {
  return (
    <Layout>
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">Feed</h1>
          <p className="pageSubtitle">Posts from you and the readers you follow.</p>
        </div>
      </header>
      <Feed />
    </Layout>
  );
}
