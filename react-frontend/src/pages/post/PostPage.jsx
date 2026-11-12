import { useEffect, useState } from "react";
import { Link, useHistory, useParams } from "react-router-dom";
import axios from "axios";
import Layout from "../../components/layout/Layout";
import Post from "../../components/post/Post";
import ReadingRail from "../../components/rail/ReadingRail";
import { errorMessage } from "../../apiCalls";
import "../reading/reading.css";

// One post with its comments open (where notifications and shared links go).
export default function PostPage() {
  const { id } = useParams();
  const history = useHistory();
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    axios
      .get(`/posts/${id}`)
      .then((res) => live && setState({ status: "ready", post: res.data }))
      .catch((err) => live && setState({ status: err.response?.status === 404 ? "notfound" : "error", message: errorMessage(err) }));
    return () => {
      live = false;
    };
  }, [id]);

  let content;
  if (state.status === "loading") {
    content = <div className="skeleton" style={{ height: 220 }} aria-busy="true" aria-label="Loading post" />;
  } else if (state.status !== "ready") {
    content = (
      <div className="card lockedPanel" role={state.status === "error" ? "alert" : undefined}>
        <h1>{state.status === "notfound" ? "Post not found" : "Couldn't load this post"}</h1>
        <p>{state.status === "notfound" ? "It may have been deleted." : state.message}</p>
        <Link to="/feed" className="btn btnSecondary">
          Back to your feed
        </Link>
      </div>
    );
  } else {
    content = (
      <>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/feed">Feed</Link> › Post
        </nav>
        <Post key={state.post._id} post={state.post} showComments onDeleted={() => history.push("/feed")} />
      </>
    );
  }

  return (
    <Layout width="reading" aside={<ReadingRail />}>
      {content}
    </Layout>
  );
}
