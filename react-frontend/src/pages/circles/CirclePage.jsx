import { useCallback, useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import { LockOutlined, PeopleOutline, ChatBubbleOutline, Add } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import Avatar from "../../components/avatar/Avatar";
import BookCover, { ProgressBar, chapterName } from "../../components/book/BookCover";
import ProgressEditor from "../../components/book/ProgressEditor";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import { plural } from "./CirclesHome";
import CircleManage from "./CircleManage";
import CircleSearch from "./CircleSearch";
import "../reading/reading.css";

// Members placed along the book by chapter: "who's where".
export function ReaderTrack({ members, total, meId }) {
  const placed = members.filter((m) => typeof m.chapter === "number");
  if (!placed.length || !total) return null;
  return (
    <div>
      <div className="readerTrack" role="img" aria-label="Where each member is in the book">
        <div className="readerTrackLine" />
        {placed.map((m) => (
          <span
            key={m._id}
            className={`readerTrackDot ${m._id === meId ? "me" : ""}`}
            style={{ left: `${Math.min(100, (m.chapter / total) * 100)}%` }}
            title={`${m.username}: ${m.chapter >= total ? "finished" : m.chapter === 0 ? "not started" : `chapter ${m.chapter}`}`}
          >
            <Avatar user={m} size={26} />
          </span>
        ))}
      </div>
      <div className="readerTrackScale" aria-hidden="true">
        <span>Start</span>
        <span>Chapter {total}</span>
      </div>
    </div>
  );
}

function NewThread({ circle, onCreated, onCancel }) {
  const [form, setForm] = useState({ chapter: circle.myProgress, title: "", body: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Read the value now: the updater runs later, after React resets the input.
  const set = (k) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [k]: value }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await axios.post(`/circles/${circle._id}/threads`, {
        chapter: Number(form.chapter),
        title: form.title.trim(),
        body: form.body.trim(),
      });
      onCreated(res.data);
      // The form closes on success, so only reset it after an error.
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  // Only chapters you've reached: you can't open a discussion ahead of yourself.
  const reachable = Array.from({ length: circle.myProgress + 1 }, (_, i) => i);
  return (
    <form className="card inlineForm" onSubmit={submit} aria-label="Start a discussion">
      <div className="formRow">
        <label className="field" style={{ flex: "0 1 200px" }}>
          About chapter
          <select className="input" value={form.chapter} onChange={set("chapter")}>
            {reachable.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "General (no spoilers)" : `Chapter ${n}`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Title
          <input className="input" value={form.title} onChange={set("title")} required minLength={3} maxLength={120} />
        </label>
      </div>
      <label className="field">
        Your thoughts
        <textarea className="input" rows={3} maxLength={4000} value={form.body} onChange={set("body")} />
      </label>
      <p className="sourceNote">Readers who haven't reached this chapter won't see the title or text.</p>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      <div className="formActions">
        <button type="button" className="btn btnGhost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btnPrimary" disabled={saving || form.title.trim().length < 3}>
          {saving ? "Posting…" : "Start discussion"}
        </button>
      </div>
    </form>
  );
}

export function ThreadList({ threads }) {
  if (!threads.length) {
    return (
      <div className="card emptyCard">
        <strong>No discussions yet</strong>
        Start the first one about a chapter you've read.
      </div>
    );
  }
  return (
    <div className="card threadGroup">
      {threads.map((t) =>
        t.locked ? (
          <div key={t._id} className="threadRow locked" aria-label={`Chapter ${t.chapterSeq} discussion, locked`}>
            <span className="chapterChip">Ch {t.chapterSeq}</span>
            <span className="threadRowBody">
              <span className="threadRowTitle">Chapter {t.chapterSeq} discussion</span>
              <span className="threadRowMeta">Reach chapter {t.chapterSeq} to read</span>
            </span>
            <LockOutlined className="lockIcon" style={{ fontSize: 18 }} />
          </div>
        ) : (
          <Link key={t._id} to={`/threads/${t._id}`} className="threadRow">
            <span className="chapterChip">{t.chapterSeq === 0 ? "Intro" : `Ch ${t.chapterSeq}`}</span>
            <span className="threadRowBody">
              <span className="threadRowTitle">{t.title}</span>
              <span className="threadRowMeta">
                {t.author.username} · {format(t.createdAt)}
              </span>
            </span>
            <span className="badge">
              <ChatBubbleOutline style={{ fontSize: 13 }} /> {t.commentCount}
            </span>
          </Link>
        )
      )}
    </div>
  );
}

export default function CirclePage() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const [circle, setCircle] = useState(null);
  const [threads, setThreads] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | notfound | error
  const [message, setMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([axios.get(`/circles/${id}`), axios.get(`/circles/${id}/threads`)]);
      setCircle(c.data);
      setThreads(t.data);
      setStatus("ready");
    } catch (err) {
      setMessage(errorMessage(err));
      setStatus(err.response?.status === 404 ? "notfound" : "error");
    }
  }, [id]);

  useEffect(() => {
    setStatus("loading");
    load();
  }, [load]);

  const act = async (path) => {
    setActionError("");
    try {
      await axios.post(`/circles/${id}/${path}`);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  let content;
  let aside = null;
  if (status === "loading") {
    content = <div className="skeleton" style={{ height: 220 }} aria-busy="true" aria-label="Loading circle" />;
  } else if (status !== "ready") {
    content = (
      <div className="card lockedPanel" role={status === "error" ? "alert" : undefined}>
        <h1>{status === "notfound" ? "Circle not found" : "Couldn't load this circle"}</h1>
        <p>{status === "notfound" ? "It may be private, or the link may be wrong. Ask the organiser for an invite code." : message}</p>
        <Link to="/" className="btn btnSecondary">
          Back to your circles
        </Link>
      </div>
    );
  } else {
    const total = circle.book.chapterCount;
    const openCount = threads.filter((t) => !t.locked).length;
    content = (
      <>
        <section className="card circleHero" aria-label={circle.name}>
          <Link to={`/books/${circle.book.slug}`} aria-label={circle.book.title}>
            <BookCover book={circle.book} size="md" />
          </Link>
          <div className="circleHeroBody">
            <h1 className="pageTitle">{circle.name}</h1>
            <span className="rowCardMeta">
              Reading <Link to={`/books/${circle.book.slug}`}>{circle.book.title}</Link> by {circle.book.author}
            </span>
            {circle.description && <p className="bookHeroText">{circle.description}</p>}
            <div className="badges">
              {circle.visibility === "private" && (
                <span className="badge private">
                  <LockOutlined style={{ fontSize: 13 }} /> Private
                </span>
              )}
              <span className="badge">
                <PeopleOutline style={{ fontSize: 14 }} /> {plural(circle.memberCount, "member")}
              </span>
              {circle.schedule && <span className="badge">{circle.schedule}</span>}
              {circle.myRole && circle.myRole !== "member" && <span className="badge accent">You're {circle.myRole === "owner" ? "the organiser" : "a moderator"}</span>}
            </div>
            {circle.myRole ? (
              <>
                <ProgressBar chapter={circle.myProgress} total={total} />
                <div className="circleHeroActions">
                  <ProgressEditor book={circle.book} chapter={circle.myProgress} compact onSaved={load} />
                  {circle.myRole !== "owner" && (
                    <button type="button" className="btn btnGhost" onClick={() => act("leave")}>
                      Leave
                    </button>
                  )}
                </div>
                {circle.inviteCode && (
                  <div className="inviteBox">
                    Permanent invite code: <code>{circle.inviteCode}</code>
                  </div>
                )}
              </>
            ) : (
              <div className="circleHeroActions">
                <button type="button" className="btn btnPrimary" onClick={() => act("join")}>
                  Join this circle
                </button>
                <span className="sourceNote">You can read open discussions; join to take part.</span>
              </div>
            )}
            {actionError && (
              <div className="errorBox" role="alert">
                {actionError}
              </div>
            )}
          </div>
        </section>

        <section className="section" aria-labelledby="discTitle">
          <div className="sectionHead">
            <h2 className="sectionTitle" id="discTitle">
              Discussions · {openCount} open{threads.length > openCount ? `, ${threads.length - openCount} ahead of you` : ""}
            </h2>
            {circle.myRole && !composing && (
              <button type="button" className="btn btnSecondary" onClick={() => setComposing(true)}>
                <Add style={{ fontSize: 18 }} /> New discussion
              </button>
            )}
          </div>
          {composing && (
            <NewThread
              circle={circle}
              onCancel={() => setComposing(false)}
              onCreated={async () => {
                setComposing(false);
                await load();
              }}
            />
          )}
          {circle.myRole && <CircleSearch circleId={circle._id} onResults={setSearching} />}
          {!searching && <ThreadList threads={threads} />}
          <p className="sourceNote">
            Discussions about chapters you haven't reached stay locked, including their titles, so nothing is spoiled.
            Current position: {chapterName(circle.myProgress)}.
          </p>
        </section>
      </>
    );
    // "Who's where" sits beside the discussions on wide screens.
    aside = (
      <>
        <section className="section" aria-labelledby="whereTitle">
          <h2 className="sectionTitle" id="whereTitle">
            Who's where
          </h2>
          <div className="card cardPad">
            {circle.myRole && <ReaderTrack members={circle.members} total={total} meId={user._id} />}
            <ul className="memberList" style={{ marginTop: circle.myRole ? 12 : 0 }}>
              {circle.members.map((m) => (
                <li key={m._id} className="memberItem">
                  <Avatar user={m} size={30} />
                  <span>
                    <Link to={`/profile/${m.username}`}>{m.username}</Link>
                    <span className="memberMeta">
                      {m.role !== "member" ? `${m.role === "owner" ? "Organiser" : "Moderator"} · ` : ""}
                      {typeof m.chapter === "number"
                        ? m.chapter >= total
                          ? "Finished"
                          : m.chapter === 0
                          ? "Not started"
                          : `Chapter ${m.chapter}`
                        : "Member"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {(circle.myRole === "owner" || circle.myRole === "moderator") && <CircleManage circle={circle} meId={user._id} onChanged={load} />}
      </>
    );
  }

  return (
    <Layout aside={aside}>
      {content}
    </Layout>
  );
}