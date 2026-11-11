import { useCallback, useContext, useEffect, useState } from "react";
import { Link, useHistory } from "react-router-dom";
import axios from "axios";
import { Add, LockOutlined, PeopleOutline, ForumOutlined } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import BookCover, { ProgressBar } from "../../components/book/BookCover";
import ProgressEditor from "../../components/book/ProgressEditor";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import "../reading/reading.css";

export const greeting = (date = new Date()) => {
  const h = date.getHours();
  return h < 5 ? "Reading late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function CircleCard({ circle, action }) {
  return (
    <article className="card rowCard" aria-label={circle.name}>
      <Link to={`/circles/${circle._id}`} aria-hidden="true" tabIndex={-1}>
        <BookCover book={circle.book} size="sm" />
      </Link>
      <div className="rowCardBody">
        <h3 className="rowCardTitle">
          <Link to={`/circles/${circle._id}`} className="cardTitleLink">
            {circle.name}
          </Link>
        </h3>
        <span className="rowCardMeta">
          {circle.book.title} · {circle.book.author}
        </span>
        {circle.description && <p className="rowCardText">{circle.description}</p>}
        <div className="badges">
          {circle.visibility === "private" && (
            <span className="badge private">
              <LockOutlined style={{ fontSize: 13 }} /> Private
            </span>
          )}
          <span className="badge">
            <PeopleOutline style={{ fontSize: 14 }} /> {plural(circle.memberCount, "member")}
          </span>
          {circle.myRole && circle.openThreads > 0 && (
            <span className="badge accent">
              <ForumOutlined style={{ fontSize: 13 }} /> {plural(circle.openThreads, "discussion")} open
            </span>
          )}
          {circle.myRole && circle.lockedThreads > 0 && (
            <span className="badge">
              <LockOutlined style={{ fontSize: 13 }} /> {circle.lockedThreads} ahead
            </span>
          )}
          {circle.schedule && <span className="badge">{circle.schedule}</span>}
        </div>
        {circle.myRole && <ProgressBar chapter={circle.myProgress} total={circle.book.chapterCount} />}
      </div>
      {action}
    </article>
  );
}

function StartCircle({ books, onCreated, onCancel }) {
  const [form, setForm] = useState({ name: "", bookId: books[0]?._id || "", visibility: "public", schedule: "", description: "" });
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
      const res = await axios.post("/circles", { ...form, name: form.name.trim() });
      onCreated(res.data);
      // The form closes on success, so only reset it after an error.
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form className="card inlineForm" onSubmit={submit} aria-label="Start a circle">
      <div className="formRow">
        <label className="field">
          Circle name
          <input className="input" value={form.name} onChange={set("name")} required minLength={3} maxLength={60} placeholder="e.g. Sunday Austen Club" />
        </label>
        <label className="field">
          Book
          <select className="input" value={form.bookId} onChange={set("bookId")} required>
            {books.map((b) => (
              <option key={b._id} value={b._id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="formRow">
        <label className="field">
          Who can find it
          <select className="input" value={form.visibility} onChange={set("visibility")}>
            <option value="public">Public: anyone can join</option>
            <option value="private">Private: invite code only</option>
          </select>
        </label>
        <label className="field">
          Reading pace (optional)
          <input className="input" value={form.schedule} onChange={set("schedule")} maxLength={120} placeholder="e.g. 3 chapters a week" />
        </label>
      </div>
      <label className="field">
        Description (optional)
        <textarea className="input" value={form.description} onChange={set("description")} maxLength={500} rows={2} />
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
        <button type="submit" className="btn btnPrimary" disabled={saving || form.name.trim().length < 3}>
          {saving ? "Creating…" : "Create circle"}
        </button>
      </div>
    </form>
  );
}

function JoinByCode({ onJoined }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post("/circles/join", { code: code.trim() });
      onJoined(res.data.circleId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form className="joinCode" onSubmit={submit} aria-label="Join with an invite code">
      <label className="srOnly" htmlFor="inviteCode">
        Invite code
      </label>
      <input id="inviteCode" className="input" placeholder="Have an invite code?" value={code} onChange={(e) => setCode(e.target.value)} />
      <button type="submit" className="btn btnSecondary" disabled={!code.trim()}>
        Join
      </button>
      {error && (
        <span className="progressError" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}

export default function CirclesHome() {
  const { user } = useContext(AuthContext);
  const history = useHistory();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [circles, books] = await Promise.all([axios.get("/circles"), axios.get("/books")]);
      setData({ ...circles.data, books: books.data });
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const join = async (circleId) => {
    try {
      await axios.post(`/circles/${circleId}/join`);
      history.push(`/circles/${circleId}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const reading = data ? data.books.filter((b) => b.shelf === "reading") : [];
  const updateBook = (bookId, result) =>
    setData((d) => ({ ...d, books: d.books.map((b) => (b._id === bookId ? { ...b, ...result } : b)) }));

  return (
    <Layout>
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">
            {greeting()}, {user.username}
          </h1>
          <p className="pageSubtitle">Your reading circles. Discussions unlock as you read.</p>
        </div>
        {!creating && data && data.books.length > 0 && (
          <button type="button" className="btn btnPrimary" onClick={() => setCreating(true)}>
            <Add style={{ fontSize: 18 }} /> Start a circle
          </button>
        )}
      </header>

      {error && (
        <div className="errorBox" role="alert">
          {error}{" "}
          <button type="button" className="btn btnGhost" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {creating && data && (
        <StartCircle books={data.books} onCancel={() => setCreating(false)} onCreated={(c) => history.push(`/circles/${c._id}`)} />
      )}

      {!data && !error ? (
        <div aria-busy="true" aria-label="Loading circles" className="cardGrid circleGrid">
          <div className="skeleton" style={{ height: 116 }} />
          <div className="skeleton" style={{ height: 116 }} />
        </div>
      ) : data ? (
        <>
          {reading.length > 0 && (
            <section className="section" aria-labelledby="continueTitle">
              <div className="sectionHead">
                <h2 className="sectionTitle" id="continueTitle">
                  Continue reading
                </h2>
                <Link to="/library" className="sectionLink">
                  Library
                </Link>
              </div>
              <div className="cardGrid continueGrid">
                {reading.map((b) => (
                  <div className="card rowCard" key={b._id}>
                    <Link to={`/books/${b.slug}`} aria-label={b.title}>
                      <BookCover book={b} size="sm" />
                    </Link>
                    <div className="rowCardBody">
                      <h3 className="rowCardTitle">
                        <Link to={`/books/${b.slug}`} className="cardTitleLink">
                          {b.title}
                        </Link>
                      </h3>
                      <span className="rowCardMeta">{b.author}</span>
                      <ProgressBar chapter={b.chapter} total={b.chapterCount} />
                      <ProgressEditor book={b} chapter={b.chapter} compact onSaved={(r) => updateBook(b._id, r)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="mineTitle">
            <div className="sectionHead">
              <h2 className="sectionTitle" id="mineTitle">
                Your circles
              </h2>
              <JoinByCode onJoined={(id) => history.push(`/circles/${id}`)} />
            </div>
            {data.mine.length === 0 ? (
              <div className="card emptyCard">
                <strong>You're not in a circle yet</strong>
                Join one below, or start your own and invite friends.
              </div>
            ) : (
              <div className="cardGrid circleGrid">
                {data.mine.map((c) => (
                  <CircleCard key={c._id} circle={c} />
                ))}
              </div>
            )}
          </section>

          {data.discover.length > 0 && (
            <section className="section" aria-labelledby="discoverTitle">
              <h2 className="sectionTitle" id="discoverTitle">
                Discover circles
              </h2>
              <div className="cardGrid circleGrid">
                {data.discover.map((c) => (
                  <CircleCard
                    key={c._id}
                    circle={c}
                    action={
                      <button type="button" className="btn btnSecondary circleJoin" onClick={() => join(c._id)}>
                        Join
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </Layout>
  );
}
