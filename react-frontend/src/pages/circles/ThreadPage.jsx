import { useCallback, useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import { LockOutlined, DeleteOutline } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import ReadingRail from "../../components/rail/ReadingRail";
import Avatar from "../../components/avatar/Avatar";
import { chapterName } from "../../components/book/BookCover";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import "../reading/reading.css";

export default function ThreadPage() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const [thread, setThread] = useState(null);
  const [state, setState] = useState({ status: "loading" }); // loading | ready | locked | notfound | error
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/threads/${id}`);
      setThread(res.data);
      setState({ status: "ready" });
    } catch (err) {
      const s = err.response?.status;
      if (s === 403 && err.response.data?.locked) setState({ status: "locked", ...err.response.data });
      else setState({ status: s === 404 ? "notfound" : "error", message: errorMessage(err) });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await axios.post(`/threads/${id}/comments`, { body: reply.trim() });
      setThread((t) => ({ ...t, comments: [...t.comments, res.data] }));
      setReply("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId) => {
    setError("");
    try {
      await axios.delete(`/comments/${commentId}`);
      setThread((t) => ({ ...t, comments: t.comments.filter((c) => c._id !== commentId) }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  let content;
  if (state.status === "loading") {
    content = <div className="skeleton" style={{ height: 240 }} aria-busy="true" aria-label="Loading discussion" />;
  } else if (state.status === "locked") {
    content = (
      <div className="card lockedPanel">
        <span className="lockBadge">
          <LockOutlined />
        </span>
        <h1>Chapter {state.chapterSeq} discussion</h1>
        <p>Reach chapter {state.chapterSeq} to read it. We keep the title and replies hidden until then, so nothing is spoiled.</p>
        <Link to={`/circles/${state.circleId}`} className="btn btnPrimary">
          Back to the circle
        </Link>
      </div>
    );
  } else if (state.status !== "ready") {
    content = (
      <div className="card lockedPanel" role={state.status === "error" ? "alert" : undefined}>
        <h1>{state.status === "notfound" ? "Discussion not found" : "Couldn't load this discussion"}</h1>
        <p>{state.status === "notfound" ? "It may have been removed, or it's in a private circle." : state.message}</p>
        <Link to="/" className="btn btnSecondary">
          Back to your circles
        </Link>
      </div>
    );
  } else {
    content = (
      <>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to={`/circles/${thread.circle._id}`}>{thread.circle.name}</Link> › {chapterName(thread.chapterSeq, thread.chapterTitle)}
        </nav>
        <article className="card threadHeader">
          <span className="chapterChip">{thread.chapterSeq === 0 ? "Intro" : `Chapter ${thread.chapterSeq}`}</span>
          <h1 className="threadTitle">{thread.title}</h1>
          <div className="byline">
            <Avatar user={thread.author} size={32} />
            <Link to={`/profile/${thread.author.username}`}>{thread.author.username}</Link>
            <time dateTime={thread.createdAt}>{format(thread.createdAt)}</time>
          </div>
          {thread.body && <p className="threadBody" style={{ marginTop: 14 }}>{thread.body}</p>}
        </article>

        <section className="section" aria-labelledby="repliesTitle">
          <h2 className="sectionTitle" id="repliesTitle">
            {thread.comments.length === 1 ? "1 reply" : `${thread.comments.length} replies`}
          </h2>
          {thread.comments.length > 0 && (
            <ul className="card replyList">
              {thread.comments.map((c) => (
                <li key={c._id} className="reply">
                  <Avatar user={c.author} size={32} />
                  <div className="replyBody">
                    <div className="byline">
                      <Link to={`/profile/${c.author.username}`}>{c.author.username}</Link>
                      <time dateTime={c.createdAt}>{format(c.createdAt)}</time>
                    </div>
                    <p className="replyText">{c.body}</p>
                  </div>
                  {(c.author._id === user._id || thread.canModerate) && (
                    <button type="button" className="btn btnGhost" onClick={() => remove(c._id)} aria-label={`Delete reply by ${c.author.username}`}>
                      <DeleteOutline style={{ fontSize: 18 }} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {thread.canReply ? (
            <form className="card inlineForm" onSubmit={send} aria-label="Reply">
              <label className="field">
                Your reply
                <textarea className="input" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
              </label>
              {error && (
                <div className="errorBox" role="alert">
                  {error}
                </div>
              )}
              <div className="formActions">
                <button type="submit" className="btn btnPrimary" disabled={sending || !reply.trim()}>
                  {sending ? "Posting…" : "Reply"}
                </button>
              </div>
            </form>
          ) : (
            <p className="sourceNote">
              <Link to={`/circles/${thread.circle._id}`}>Join the circle</Link> to reply.
            </p>
          )}
        </section>
      </>
    );
  }

  return (
    <Layout width="reading" aside={<ReadingRail />}>
      {content}
    </Layout>
  );
}
