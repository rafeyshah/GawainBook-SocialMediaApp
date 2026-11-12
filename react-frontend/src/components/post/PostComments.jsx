import { useCallback, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import Avatar from "../avatar/Avatar";
import ReportForm from "../report/ReportForm";

export const MAX_COMMENT = 1000;

function CommentEditor({ comment, onSaved, onCancel }) {
  const [value, setValue] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await axios.patch(`/post-comments/${comment._id}`, { body: value.trim() });
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <form className="inlineForm" onSubmit={submit} aria-label="Edit comment">
      <label className="field">
        Your comment
        <textarea className="input" rows={2} maxLength={MAX_COMMENT} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      <div className="formActions">
        <button type="button" className="btn btnGhost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btnPrimary" disabled={saving || !value.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Comments under a post: read, add, edit your own, delete your own (or any on
// your own post), report others'.
export default function PostComments({ postId, onCountChange }) {
  const { user } = useContext(AuthContext);
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // { kind: "edit" | "report", id }
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await axios.get(`/posts/${postId}/comments`);
      setList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(errorMessage(err));
      setList([]);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the count on the post in step.
  useEffect(() => {
    if (list && onCountChange) onCountChange(list.length);
  }, [list, onCountChange]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await axios.post(`/posts/${postId}/comments`, { body: text.trim() });
      setList((l) => [...(l || []), res.data]);
      setText("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm("Delete this comment?")) return;
    setError("");
    try {
      await axios.delete(`/post-comments/${c._id}`);
      setList((l) => l.filter((x) => x._id !== c._id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const isOpen = (kind, id) => open && open.kind === kind && open.id === id;

  return (
    <section className="postComments" aria-label="Comments">
      {list === null ? (
        <div className="skeleton" style={{ height: 40 }} aria-busy="true" aria-label="Loading comments" />
      ) : loadError ? (
        <p className="errorBox" role="alert">
          {loadError}
        </p>
      ) : list.length > 0 ? (
        <ul className="postCommentList">
          {list.map((c) => {
            const mine = c.author._id === user._id;
            return (
              <li key={c._id} className="postComment">
                <Avatar user={c.author} size={28} />
                <div className="postCommentBody">
                  <div className="byline">
                    <Link to={`/profile/${c.author.username}`}>{c.author.username}</Link>
                    <time dateTime={c.createdAt}>{format(c.createdAt)}</time>
                    {c.editedAt && <span className="editedMark">· edited</span>}
                  </div>
                  {isOpen("edit", c._id) ? (
                    <CommentEditor
                      comment={c}
                      onCancel={() => setOpen(null)}
                      onSaved={(saved) => {
                        setList((l) => l.map((x) => (x._id === c._id ? { ...x, body: saved.body, editedAt: saved.editedAt } : x)));
                        setOpen(null);
                      }}
                    />
                  ) : (
                    <p className="postCommentText">{c.body}</p>
                  )}
                  <div className="itemActions">
                    {mine && !isOpen("edit", c._id) && (
                      <button type="button" className="linkBtn" onClick={() => setOpen({ kind: "edit", id: c._id })} aria-label={`Edit comment by ${c.author.username}`}>
                        Edit
                      </button>
                    )}
                    {c.canDelete && (
                      <button type="button" className="linkBtn danger" onClick={() => remove(c)} aria-label={`Delete comment by ${c.author.username}`}>
                        Delete
                      </button>
                    )}
                    {!mine && (
                      <button type="button" className="linkBtn" onClick={() => setOpen({ kind: "report", id: c._id })} aria-label={`Report comment by ${c.author.username}`}>
                        Report
                      </button>
                    )}
                  </div>
                  {isOpen("report", c._id) && (
                    <ReportForm
                      targetType="post_comment"
                      targetId={c._id}
                      onCancel={() => setOpen(null)}
                      onDone={() => {
                        setOpen(null);
                        setNotice("Thanks. GawainBook's moderators will take a look.");
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sourceNote" style={{ margin: 0 }}>
          No comments yet. Start the conversation.
        </p>
      )}

      {notice && (
        <div className="noticeBox" role="status">
          {notice}
        </div>
      )}

      <form className="postCommentForm" onSubmit={send} aria-label="Add a comment">
        <Avatar user={user} size={28} />
        <label className="srOnly" htmlFor={`comment-${postId}`}>
          Write a comment
        </label>
        <textarea
          id={`comment-${postId}`}
          className="input"
          rows={1}
          maxLength={MAX_COMMENT}
          placeholder="Write a comment…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
        />
        <button type="submit" className="btn btnPrimary" disabled={sending || !text.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
