import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { LockOutlined, PeopleOutline } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import BookCover, { ProgressBar } from "../../components/book/BookCover";
import ProgressEditor from "../../components/book/ProgressEditor";
import { errorMessage } from "../../apiCalls";
import { plural } from "../circles/CirclesHome";
import "../reading/reading.css";

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
              {book.publishedYear ? ` · ${book.publishedYear}` : ""} · {plural(book.chapterCount, "chapter")}
            </p>
            {book.description && <p className="bookHeroText">{book.description}</p>}
            <ShelfPicker value={book.shelf} onChange={setShelf} disabled={saving} />
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
      </>
    );
  }

  return <Layout>{content}</Layout>;
}
