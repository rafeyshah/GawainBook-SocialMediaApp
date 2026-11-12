import { useContext, useEffect, useState } from "react";
import axios from "axios";
import { format } from "timeago.js";
import { Link } from "react-router-dom";
import { Favorite, FavoriteBorder, ChatBubbleOutline, VisibilityOffOutlined } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import Avatar from "../avatar/Avatar";
import ReportForm from "../report/ReportForm";
import PostComments from "./PostComments";
import { MAX_LENGTH, SpoilerFields } from "../share/Share";
import "./post.css";
import "../../pages/reading/community.css";

const PF = process.env.REACT_APP_PUBLIC_FOLDER || "/images/";

export const likeLabel = (n) => (n === 1 ? "1 like" : `${n} likes`);
export const commentLabel = (n) => (n === 0 ? "Comment" : n === 1 ? "1 comment" : `${n} comments`);

// Inline editor for your own post: text and spoiler cover.
function PostEditor({ post, onSaved, onCancel }) {
  const [text, setText] = useState(post.desc || "");
  const [spoiler, setSpoiler] = useState(Boolean(post.spoiler));
  const [spoilerFor, setSpoilerFor] = useState(post.spoilerFor || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tooLong = text.length > MAX_LENGTH;
  const empty = !text.trim() && !post.img;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await axios.put(`/posts/${post._id}`, { desc: text.trim(), spoiler, spoilerFor: spoiler ? spoilerFor.trim() : null });
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form className="inlineForm postEditor" onSubmit={submit} aria-label="Edit post">
      <label className="field">
        Your post
        <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      {tooLong && <span className="shareCount over">{MAX_LENGTH - text.length}</span>}
      <SpoilerFields spoiler={spoiler} setSpoiler={setSpoiler} spoilerFor={spoilerFor} setSpoilerFor={setSpoilerFor} idPrefix={`edit-${post._id}`} />
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      <div className="formActions">
        <button type="button" className="btn btnGhost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btnPrimary" disabled={saving || tooLong || empty}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export default function Post({ post: initial, onDeleted, showComments = false }) {
  const { user: currentUser } = useContext(AuthContext);
  const [post, setPost] = useState(initial);
  const [author, setAuthor] = useState(null);
  const [liked, setLiked] = useState(initial.likes.includes(currentUser._id));
  const [likes, setLikes] = useState(initial.likes.length);
  const [busy, setBusy] = useState(false);
  const [likeError, setLikeError] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(showComments);
  const [commentCount, setCommentCount] = useState(initial.commentCount || 0);
  const [actionError, setActionError] = useState("");
  const mine = post.userId === currentUser._id;

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

  const remove = async () => {
    if (!window.confirm("Delete this post? Its comments and likes go too.")) return;
    setActionError("");
    try {
      await axios.delete(`/posts/${post._id}`);
      if (onDeleted) onDeleted(post._id);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const name = author?.username;
  const knownAuthor = author && author._id;
  // Your own spoiler posts are shown to you (you wrote them); others start covered.
  const covered = post.spoiler && !revealed && !mine && !editing;

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
        <Link to={`/posts/${post._id}`} className="postDate" title={new Date(post.createdAt).toLocaleString()}>
          <time dateTime={post.createdAt}>{format(post.createdAt)}</time>
          {post.editedAt && <span className="editedMark"> · edited</span>}
        </Link>
      </header>

      {editing ? (
        <PostEditor
          post={post}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setPost((p) => ({ ...p, ...updated }));
            setEditing(false);
          }}
        />
      ) : (
        <div className={`postBody ${covered ? "isCovered" : ""}`}>
          {post.spoiler && (
            <span className="spoilerTag">
              <VisibilityOffOutlined style={{ fontSize: 14 }} /> Spoiler{post.spoilerFor ? ` for ${post.spoilerFor}` : ""}
            </span>
          )}
          <div className="postContent" aria-hidden={covered || undefined}>
            {post.desc && <p className="postText">{post.desc}</p>}
            {post.img && <img className="postImg" src={PF + post.img} alt="" loading="lazy" />}
          </div>
          {covered && (
            <button type="button" className="spoilerReveal" onClick={() => setRevealed(true)}>
              Show spoiler
            </button>
          )}
        </div>
      )}

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
        <button
          type="button"
          className="postCommentsToggle"
          aria-expanded={commentsOpen && !covered}
          onClick={() => {
            // Comments on a spoiler post can spoil too: opening them means you've chosen to see it.
            if (covered) {
              setRevealed(true);
              setCommentsOpen(true);
            } else setCommentsOpen((o) => !o);
          }}
        >
          <ChatBubbleOutline style={{ fontSize: 18 }} />
          {commentLabel(commentCount)}
        </button>
        {likeError && (
          <span className="postLikeError" role="alert">
            Couldn't update. Try again.
          </span>
        )}
        <span className="postActions">
          {mine && !editing && (
            <>
              <button type="button" className="linkBtn" onClick={() => setEditing(true)} aria-label="Edit post">
                Edit
              </button>
              <button type="button" className="linkBtn danger" onClick={remove} aria-label="Delete post">
                Delete
              </button>
            </>
          )}
          {!mine && !reported && !reporting && (
            <button type="button" className="linkBtn" onClick={() => setReporting(true)} aria-label={`Report post by ${name || "this reader"}`}>
              Report
            </button>
          )}
          {reported && (
            <span className="memberMeta" role="status">
              Reported. Thanks.
            </span>
          )}
        </span>
      </footer>
      {actionError && (
        <div className="errorBox" role="alert">
          {actionError}
        </div>
      )}
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
      {commentsOpen && !covered && <PostComments postId={post._id} onCountChange={setCommentCount} />}
    </article>
  );
}
