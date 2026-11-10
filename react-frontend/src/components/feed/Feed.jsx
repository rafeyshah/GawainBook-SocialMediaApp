import { useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import Post from "../post/Post";
import Share from "../share/Share";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import "./feed.css";

const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

// Home timeline (no username) or one reader's posts (with username).
export default function Feed({ username }) {
  const { user } = useContext(AuthContext);
  const [posts, setPosts] = useState(null); // null = loading
  const [error, setError] = useState("");
  const isOwn = !username || username === user.username;

  const load = useCallback(async () => {
    setPosts(null);
    setError("");
    try {
      const res = username
        ? await axios.get(`/posts/profile/${encodeURIComponent(username)}`)
        : await axios.get("/posts/timeline");
      setPosts([...res.data].sort(newestFirst));
    } catch (err) {
      setError(errorMessage(err));
      setPosts([]);
    }
  }, [username]); // the timeline comes from the session, not a user id

  useEffect(() => {
    load();
  }, [load]);

  const addPost = (post) => setPosts((current) => [post, ...(current || [])]);

  return (
    <section className="feed" aria-label={username ? `Posts by ${username}` : "Your feed"}>
      {isOwn && <Share onPosted={addPost} />}

      {posts === null ? (
        <div aria-busy="true" aria-label="Loading posts">
          {[0, 1].map((i) => (
            <div key={i} className="feedSkeleton card" />
          ))}
        </div>
      ) : error ? (
        <div className="feedState card" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btnSecondary" onClick={load}>
            Try again
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="feedState card">
          <h3>{username ? "No posts yet" : "Your feed is quiet"}</h3>
          <p>
            {username
              ? isOwn
                ? "Share what you're reading. Your first post will appear here."
                : `${username} hasn't posted yet.`
              : "Share what you're reading, or follow other readers to see their posts here."}
          </p>
        </div>
      ) : (
        posts.map((p) => <Post key={p._id} post={p} />)
      )}
    </section>
  );
}
