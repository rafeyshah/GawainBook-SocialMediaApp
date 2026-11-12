import { useContext, useEffect, useState } from "react";
import axios from "axios";
import { format } from "timeago.js";
import { Link } from "react-router-dom";
import { Favorite, FavoriteBorder } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import Avatar from "../avatar/Avatar";
import ReportForm from "../report/ReportForm";
import "../../pages/reading/community.css";
import "./post.css";

const PF = process.env.REACT_APP_PUBLIC_FOLDER || "/images/";

export const likeLabel = (n) => (n === 1 ? "1 like" : `${n} likes`);

export default function Post({ post }) {
  const { user: currentUser } = useContext(AuthContext);
  const [author, setAuthor] = useState(null);
  const [liked, setLiked] = useState(post.likes.includes(currentUser._id));
  const [likes, setLikes] = useState(post.likes.length);
  const [busy, setBusy] = useState(false);
  const [likeError, setLikeError] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`/users?userId=${post.userId}`)
      .then((res) => !cancelled && setAuthor(res.data))
      .catch(() => !cancelled && setAuthor({ username: "Unknown reader" }));
    return () => {
      cancelled = true;
    };
  }, [post.userId]);

  // Optimistic: update immediately, then sync with the server or roll back.
  const toggleLike = async () => {
    if (busy) return;
    const prev = { liked, likes };
    setBusy(true);
    setLikeError(false);
    setLiked(!liked);
    setLikes(likes + (liked ? -1 : 1));
    try {
      const res = await axios.put(`/posts/${post._id}/like`);
      if (res.data && typeof res.data.likes === "number") {
        setLiked(res.data.liked);
        setLikes(res.data.likes);
      }
    } catch {
      setLiked(prev.liked);
      setLikes(prev.likes);
      setLikeError(true);
    } finally {
      setBusy(false);
    }
  };

  const name = author?.username;
  const knownAuthor = author && author._id;

  return (
    <article className="post card" aria-label={name ? `Post by ${name}` : "Post"}>
      <header className="postHeader">
        {knownAuthor ? (
          <Link to={`/profile/${name}`} className="postAuthor">
            <Avatar user={author} size={40} />
            <span className="postName">{name}</span>
          </Link>
        ) : (
          <span className="postAuthor">
            <Avatar user={author || { username: "" }} size={40} />
            <span className="postName">{name || " "}</span>
          </span>
        )}
        <time className="postDate" dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
          {format(post.createdAt)}
        </time>
      </header>

      {post.desc && <p className="postText">{post.desc}</p>}
      {post.img && <img className="postImg" src={PF + post.img} alt="" loading="lazy" />}

      <footer className="postFooter">
        <button
          type="button"
          className={`postLike ${liked ? "liked" : ""}`}
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          disabled={busy}
        >
          {liked ? <Favorite style={{ fontSize: 20 }} /> : <FavoriteBorder style={{ fontSize: 20 }} />}
        </button>
        <span className="postLikes">{likeLabel(likes)}</span>
        {likeError && (
          <span className="postLikeError" role="alert">
            Couldn't update. Try again.
          </span>
        )}
        {post.userId !== currentUser._id && !reported && !reporting && (
          <button type="button" className="linkBtn postReport" onClick={() => setReporting(true)} aria-label={`Report post by ${name || "this reader"}`}>
            Report
          </button>
        )}
        {reported && (
          <span className="postReport memberMeta" role="status">
            Reported. Thanks.
          </span>
        )}
      </footer>
      {reporting && (
        <ReportForm
          targetType="post"
          targetId={post._id}
          onCancel={() => setReporting(false)}
          onDone={() => {
            setReporting(false);
            setReported(true);
          }}
        />
      )}
    </article>
  );
}
