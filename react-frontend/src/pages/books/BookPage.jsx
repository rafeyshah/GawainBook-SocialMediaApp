import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { LockOutlined, PeopleOutline } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import BookCover, { ProgressBar, chapterName } from "../../components/book/BookCover";
import ProgressEditor from "../../components/book/ProgressEditor";
import { errorMessage } from "../../apiCalls";
import { plural } from "../circles/CirclesHome";
import "../reading/reading.css";
import "../reading/community.css";

export const MAX_CHAPTERS = 200;

// "How many chapters does your edition have?" for books without a list.
export function ChapterSetup({ book, onSaved, correcting = false, onCancel }) {
  const [count, setCount] = useState(correcting ? String(book.chapterCount) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_CHAPTERS;
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await axios.post(`/books/${book._id}/chapters`, { count: n });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <form className="chapterSetup" onSubmit={submit} aria-label="Set up chapters">
      <label className="field">
        How many chapters does your edition have?
        <input className="input" type="number" inputMode="numeric" min={1} max={MAX_CHAPTERS} step={1} value={count} onChange={(e) => setCount(e.target.value)} placeholder="e.g. 31" />
      </label>
      <p className="sourceNote">
        This turns on chapter-by-chapter progress and lets circles read the book. You can correct it until a circle starts reading.
      </p>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      <div className="formActions">
        {onCancel && (
          <button type="button" className="btn btnGhost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btnPrimary" disabled={!valid || saving}>
          {saving ? "Saving…" : "Save chapters"}
        </button>
      </div>
    </form>
  );
}

export const SHELF_LABELS = [
  ["want", "Want to read"],
  ["reading", "Reading"],
  ["finished", "Finished"],
];

export function ShelfPicker({ value, onChange, disabled }) {
  return (
    <div className="shelfPicker" role="radiogroup" aria-label="Shelf">
      {SHELF_LABELS.map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} disabled={disabled} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function BookPage() {
  const { slug } = useParams();
  const [book, setBook] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/books/${encodeURIComponent(slug)}`);
      setBook(res.data);
      setStatus("ready");
    } catch (err) {
      setError(errorMessage(err));
      setStatus(err.response?.status === 404 ? "notfound" : "error");
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const removeFromShelves = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await axios.delete(`/books/${book._id}/progress`);
      setBook((b) => ({ ...b, ...res.data, canSetChapters: false }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setCorrecting(false);
    await load();
  };

  const setShelf = async (shelf) => {
    setSaving(true);
    setError("");
    try {
      const res = await axios.put(`/books/${book._id}/progress`, { shelf });
      setBook((b) => ({ ...b, ...res.data }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  let content;
  let aside = null;
  if (status === "loading") {
    content = <div className="skeleton" style={{ height: 280 }} aria-busy="true" aria-label="Loading book" />;
  } else if (status !== "ready") {
    content = (
      <div className="card lockedPanel" role={status === "error" ? "alert" : undefined}>
        <h1>{status === "notfound" ? "Book not found" : "Couldn't load this book"}</h1>
        <p>{status === "notfound" ? "Have a look in the library instead." : error}</p>
        <Link to="/library" className="btn btnSecondary">
          Go to the library
        </Link>
      </div>
    );
  } else {
    content = (
      <>
        <section className="card bookHero" aria-label={book.title}>
          <BookCover book={book} size="lg" />
          <div className="bookHeroBody">
            <h1 className="bookHeroTitle">{book.title}</h1>
            <p className="bookHeroAuthor">
              {book.author}
              {book.publishedYear ? ` · ${book.publishedYear}` : ""}
              {book.chapterCount ? ` · ${plural(book.chapterCount, "chapter")}` : ""}
              {book.pageCount ? ` · about ${book.pageCount} pages` : ""}
            </p>
            {book.description && <p className="bookHeroText">{book.description}</p>}
            {book.subjects && book.subjects.length > 0 && (
              <ul className="genreChips" aria-label="Subjects" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {book.subjects.map((s) => (
                  <li key={s} className="genreChip">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <ShelfPicker value={book.shelf} onChange={setShelf} disabled={saving} />
            {book.shelf && (
              <button type="button" className="linkBtn danger removeShelf" onClick={removeFromShelves} disabled={saving}>
                Remove from my shelves
              </button>
            )}
            {book.shelf && (
              <>
                <ProgressBar chapter={book.chapter} total={book.chapterCount} />
                <ProgressEditor
                  key={`${book.shelf}-${book.chapter}`}
                  book={book}
                  chapter={book.chapter}
                  chapters={book.chapters}
                  onSaved={(r) => setBook((b) => ({ ...b, ...r }))}
                />
              </>
            )}
            {error && (
              <div className="errorBox" role="alert">
                {error}
              </div>
            )}
            {book.sourceNote && <p className="sourceNote">{book.sourceNote}</p>}
          </div>
        </section>

        {book.chapterCount === 0 ? (
          <section className="section" aria-labelledby="chaptersTitle">
            <h2 className="sectionTitle" id="chaptersTitle">
              Chapters
            </h2>
            <div className="card emptyCard">
              <strong>No chapter list yet</strong>
              {book.canSetChapters ? (
                <ChapterSetup book={book} onSaved={reload} />
              ) : (
                <>Add this book to one of your shelves to set up its chapters. Until then, circles can't read it.</>
              )}
              {book.olWorkId && (
                <>
                  {" "}
                  <a href={`https://openlibrary.org/works/${book.olWorkId}`} target="_blank" rel="noopener noreferrer">
                    See it on Open Library
                  </a>
                </>
              )}
            </div>
          </section>
        ) : (
        <section className="section" aria-labelledby="chaptersTitle">
          <h2 className="sectionTitle" id="chaptersTitle">
            Chapters
          </h2>
          <div className="card cardPad">
            <ol className="chapterMap" aria-label={`${book.chapterCount} chapters`}>
              {book.chapters.map((c) => {
                const state = c.seq === book.chapter && book.shelf === "reading" ? "current" : c.seq <= book.chapter ? "read" : "";
                return (
                  <li
                    key={c.seq}
                    className={`chapterCell ${state}`}
                    title={chapterName(c.seq, c.title)}
                    aria-label={`${chapterName(c.seq, c.title)}${state === "current" ? ", you're here" : state === "read" ? ", read" : ""}`}
                  >
                    {c.seq}
                  </li>
                );
              })}
            </ol>
            <div className="chapterLegend" aria-hidden="true">
              <span className="read">Read</span>
              <span className="current">You're here</span>
              <span>Ahead</span>
            </div>
            {book.chaptersSetByReader && book.canSetChapters && !correcting && (
              <p className="sourceNote" style={{ marginBottom: 0 }}>
                Chapters were added by a reader.{" "}
                <button type="button" className="linkBtn" onClick={() => setCorrecting(true)}>
                  Correct the count
                </button>
              </p>
            )}
            {correcting && <ChapterSetup book={book} correcting onSaved={reload} onCancel={() => setCorrecting(false)} />}
          </div>
        </section>
        )}
      </>
    );
    // Circles reading this book sit beside the details on wide screens.
    aside = (
        <section className="section" aria-labelledby="circlesTitle">
          <h2 className="sectionTitle" id="circlesTitle">
            Circles reading this book
          </h2>
          {book.circles.length === 0 ? (
            <div className="card emptyCard">
              <strong>No circles yet</strong>
              Start one from your <Link to="/">circles page</Link>.
            </div>
          ) : (
            <div className="card threadGroup">
              {book.circles.map((c) => (
                <Link key={c._id} to={`/circles/${c._id}`} className="threadRow">
                  <span className="threadRowBody">
                    <span className="threadRowTitle">{c.name}</span>
                    <span className="threadRowMeta">
                      {plural(Number(c.memberCount), "member")}
                      {c.isMember ? " · You're a member" : ""}
                    </span>
                  </span>
                  {c.visibility === "private" ? (
                    <span className="badge private">
                      <LockOutlined style={{ fontSize: 13 }} /> Private
                    </span>
                  ) : (
                    <span className="badge">
                      <PeopleOutline style={{ fontSize: 14 }} /> Public
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
    );
  }

  return (
    <Layout aside={aside}>
      {content}
    </Layout>
  );
}