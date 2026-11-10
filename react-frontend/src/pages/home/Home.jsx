import Layout from "../../components/layout/Layout";
import Feed from "../../components/feed/Feed";

export default function Home() {
  return (
    <Layout>
      <h1 className="srOnly">Home</h1>
      <Feed />
    </Layout>
  );
}
