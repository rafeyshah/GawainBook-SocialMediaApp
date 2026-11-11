import { useCallback, useContext, useEffect, useState } from "react";
import { Link, useHistory, useParams } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import { LockOutlined } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import ReadingRail from "../../components/rail/ReadingRail";
import Avatar from "../../components/avatar/Avatar";
import ReportForm from "../../components/report/ReportForm";
import { chapterName } from "../../components/book/BookCover";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import "../reading/reading.css";
import "../reading/community.css";

// Edit box shared by the discussion and its replies.
function EditBox({ label, initial, maxLength, rows = 3, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(value.trim());
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <form className="inlineForm" onSubmit={submit} aria-label={`Edit ${label}`}>
      <label className="field">
        {label}
        <textarea className="input" rows={rows} maxLength={maxLength} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
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

function ThreadEditor({ thread, onSaved, onCancel }) {
  const [title, setTitle] = useState(thread.title);
  const [body, setBody] = useState(thread.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await axios.patch(`/threads/${thread._id}`, { title: title.trim(), body: body.trim() });
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <form className="inlineForm" onSubmit={submit} aria-label="Edit discussion">
      <label className="field">
        Title
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={120} required />
      </label>
      <label className="field">
        Your thoughts
        <textarea className="input" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
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
        <button type="submit" className="btn btnPrimary" disabled={saving || title.trim().length < 3}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export default function ThreadPage() {
  const { id } = useParams();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [thread, setThread] = useState(null);
  const [state, setState] = useState({ status: "loading" }); // loading | ready | locked | notfound | error
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(""); // moderation / edit actions
  const [replyError, setReplyError] = useState("");
  const [notice, setNotice] = useState("");
  // What's open: { kind: "edit" | "report", id } (id "thread" for the discussion)
  const [open, setOpen] = useState(null);

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

  const run = async (fn, done) => {
    setError("");
    setNotice("");
    try {
      await fn();
      if (done) done();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setReplyError("");
    try {
      const res = await axios.post(`/threads/${id}/comments`, { body: reply.trim() });
      setThread((t) => ({ ...t, comments: [...t.comments, res.data] }));
      setReply("");
    } catch (err) {
      setReplyError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const updateComment = (cid, change) => setThread((t) => ({ ...t, comments: t.comments.map((c) => (c._id === cid ? { ...c, ...change } : c)) }));

  const removeComment = (cid) =>
    run(async () => {
      await axios.delete(`/comments/${cid}`);
      setThread((t) => ({ ...t, comments: t.comments.filter((c) => c._id !== cid) }));
    });

  const hideComment = (c, hide) =>
    run(async () => {
      await axios.post(`/comments/${c._id}/${hide ? "hide" : "unhide"}`);
      updateComment(c._id, { hidden: hide });
    });

  const deleteThread = () => {
    if (!window.confirm("Delete this discussion and all its replies?")) return;
    run(async () => {
      await axios.delete(`/threads/${id}`);
      history.push(`/circles/${thread.circle._id}`);
    });
  };

  const hideThread = (hide) =>
    run(async () => {
      await axios.post(`/threads/${id}/${hide ? "hide" : "unhide"}`);
      setThread((t) => ({ ...t, hidden: hide }));
    });

  const blockReader = (author) => {
    if (!window.confirm(`Block ${author.username}? You won't see each other's discussions or replies, and any follows between you end.`)) return;
    run(async () => {
      await axios.put(`/blocks/${author._id}`);
      if (author._id === thread.author._id) history.push(`/circles/${thread.circle._id}`);
      else {
        setThread((t) => ({ ...t, comments: t.comments.filter((c) => c.author?._id !== author._id) }));
        setNotice(`You've blocked ${author.username}. You can unblock them from your profile.`);
      }
    });
  };

  const reported = () => {
    setOpen(null);
    setNotice("Thanks. The circle's moderators will take a look.");
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
    const mineThread = thread.author._id === user._id;
    const isOpen = (kind, key) => open && open.kind === kind && open.id === key;
    content = (
      <>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to={`/circles/${thread.circle._id}`}>{thread.circle.name}</Link> › {chapterName(thread.chapterSeq, thread.chapterTitle)}
        </nav>
        <article className="card threadHeader">
          <span className="chapterChip">{thread.chapterSeq === 0 ? "Intro" : `Chapter ${thread.chapterSeq}`}</span>{" "}
          {thread.hidden && <span className="modFlag">Hidden from members</span>}
          {isOpen("edit", "thread") ? (
            <ThreadEditor
              thread={thread}
              onCancel={() => setOpen(null)}
              onSaved={(t) => {
                setThread((old) => ({ ...old, ...t }));
                setOpen(null);
              }}
            />
          ) : (
            <>
              <h1 className="threadTitle">{thread.title}</h1>
              <div className="byline">
                <Avatar user={thread.author} size={32} />
                <Link to={`/profile/${thread.author.username}`}>{thread.author.username}</Link>
                <time dateTime={thread.createdAt}>{format(thread.createdAt)}</time>
                {thread.editedAt && <span className="editedMark">· edited</span>}
              </div>
              {thread.body && <p className="threadBody" style={{ marginTop: 14 }}>{thread.body}</p>}
            </>
          )}
          <div className="itemActions">
            {mineThread && !isOpen("edit", "thread") && (
              <button type="button" className="linkBtn" onClick={() => setOpen({ kind: "edit", id: "thread" })}>
                Edit
              </button>
            )}
            {(mineThread || thread.canModerate) && (
              <button type="button" className="linkBtn danger" onClick={deleteThread}>
                Delete discussion
              </button>
            )}
            {thread.canModerate && (
              <button type="button" className="linkBtn" onClick={() => hideThread(!thread.hidden)}>
                {thread.hidden ? "Unhide" : "Hide from members"}
              </button>
            )}
            {!mineThread && (
              <>
                <button type="button" className="linkBtn" onClick={() => setOpen({ kind: "report", id: "thread" })}>
                  Report
                </button>
                <button type="button" className="linkBtn" onClick={() => blockReader(thread.author)}>
                  Block {thread.author.username}
                </button>
              </>
            )}
          </div>
          {isOpen("report", "thread") && <ReportForm targetType="thread" targetId={thread._id} onDone={reported} onCancel={() => setOpen(null)} />}
        </article>

        {notice && (
          <div className="noticeBox" role="status" style={{ marginTop: 12 }}>
            {notice}
          </div>
        )}
        {error && (
          <div className="errorBox" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <section className="section" aria-labelledby="repliesTitle">
          <h2 className="sectionTitle" id="repliesTitle">
            {thread.comments.length === 1 ? "1 reply" : `${thread.comments.length} replies`}
          </h2>
          {thread.comments.length > 0 && (
            <ul className="card replyList">
              {thread.comments.map((c) => {
                // Members see hidden replies as a placeholder with no author or text.
                if (c.hidden && !c.author) {
                  return (
                    <li key={c._id} className="reply isHidden">
                      <p className="hiddenNote">A moderator hid this reply.</p>
                    </li>
                  );
                }
                const mine = c.author._id === user._id;
                return (
                  <li key={c._id} className={`reply ${c.hidden ? "isHidden" : ""}`}>
                    <Avatar user={c.author} size={32} />
                    <div className="replyBody">
                      <div className="byline">
                        <Link to={`/profile/${c.author.username}`}>{c.author.username}</Link>
                        <time dateTime={c.createdAt}>{format(c.createdAt)}</time>
                        {c.editedAt && <span className="editedMark">· edited</span>}
                        {c.hidden && <span className="modFlag">Hidden</span>}
                      </div>
                      {isOpen("edit", c._id) ? (
                        <EditBox
                          label="Your reply"
                          initial={c.body}
                          maxLength={2000}
                          onCancel={() => setOpen(null)}
                          onSave={async (body) => {
                            const res = await axios.patch(`/comments/${c._id}`, { body });
                            updateComment(c._id, { body: res.data.body, editedAt: res.data.editedAt });
                            setOpen(null);
                          }}
                        />
                      ) : (
                        <p className="replyText">{c.body}</p>
                      )}
                      <div className="itemActions">
                        {mine && !c.hidden && !isOpen("edit", c._id) && (
                          <button type="button" className="linkBtn" onClick={() => setOpen({ kind: "edit", id: c._id })} aria-label={`Edit reply by ${c.author.username}`}>
                            Edit
                          </button>
                        )}
                        {(mine || thread.canModerate) && (
                          <button type="button" className="linkBtn danger" onClick={() => removeComment(c._id)} aria-label={`Delete reply by ${c.author.username}`}>
                            Delete
                          </button>
                        )}
                        {thread.canModerate && !mine && (
                          <button type="button" className="linkBtn" onClick={() => hideComment(c, !c.hidden)} aria-label={`${c.hidden ? "Unhide" : "Hide"} reply by ${c.author.username}`}>
                            {c.hidden ? "Unhide" : "Hide"}
                          </button>
                        )}
                        {!mine && (
                          <>
                            <button type="button" className="linkBtn" onClick={() => setOpen({ kind: "report", id: c._id })} aria-label={`Report reply by ${c.author.username}`}>
                              Report
                            </button>
                            <button type="button" className="linkBtn" onClick={() => blockReader(c.author)} aria-label={`Block ${c.author.username}`}>
                              Block
                            </button>
                          </>
                        )}
                      </div>
                      {isOpen("report", c._id) && <ReportForm targetType="comment" targetId={c._id} onDone={reported} onCancel={() => setOpen(null)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {thread.canReply ? (
            <form className="card inlineForm" onSubmit={send} aria-label="Reply">
              <label className="field">
                Your reply
                <textarea className="input" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
              </label>
              {replyError && (
                <div className="errorBox" role="alert">
                  {replyError}
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
