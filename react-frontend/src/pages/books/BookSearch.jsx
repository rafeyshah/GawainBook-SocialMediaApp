import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Search } from "@material-ui/icons";
import BookCover from "../../components/book/BookCover";
import { errorMessage } from "../../apiCalls";
import "../reading/community.css";

// Search our books (ready for circles) and Open Library (for discovery).
export default function BookSearch() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setError("");
    try {
      setResult((await axios.get("/books/search", { params: { q: query } })).data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section" aria-labelledby="bookSearchTitle">
      <h2 className="sectionTitle" id="bookSearchTitle">
        Find a book
      </h2>
      <form className="searchBar" role="search" aria-label="Search books" onSubmit={submit}>
        <input
          className="input"
          type="search"
          aria-label="Title or author"
          placeholder="Title or author, e.g. Jane Austen"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btnSecondary" disabled={busy || q.trim().length < 2}>
          <Search style={{ fontSize: 18 }} /> {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div aria-live="polite">
          {result.local.length > 0 && (
            <>
              <h3 className="subhead">Ready for reading circles</h3>
              <div className="olGrid" aria-label="Books with chapters">
                {result.local.map((b) => (
                  <Link key={b._id} to={`/books/${b.slug}`} className="olBook" style={{ color: "inherit", textDecoration: "none" }}>
                    <BookCover book={b} size="md" />
                    <span className="olTitle">{b.title}</span>
                    <span className="olMeta">
                      {b.author} · {b.chapterCount} chapters
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
          <h3 className="subhead">From Open Library</h3>
          {result.openLibraryError ? (
            <p className="sourceNote" role="status">
              Open Library isn't answering right now. Try again in a minute.
            </p>
          ) : result.openLibrary.length === 0 ? (
            <p className="sourceNote">{result.local.length ? "No other editions found." : `No books found for “${result.query}”.`}</p>
          ) : (
            <>
              <p className="sourceNote">
                These don't have chapters in GawainBook yet, so circles can't read them. Tell us which ones you'd like next.
              </p>
              <ul className="olGrid" aria-label="Open Library results" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.openLibrary.map((b) => (
                  <li key={b.key} className="olBook">
                    {b.coverUrl ? (
                      <img src={b.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="olCoverFallback" aria-hidden="true">
                        {b.title}
                      </span>
                    )}
                    <a className="olTitle" href={`https://openlibrary.org${b.key}`} target="_blank" rel="noopener noreferrer">
                      {b.title}
                    </a>
                    <span className="olMeta">
                      {b.author}
                      {b.year ? ` · ${b.year}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="sourceNote">
            Book data from <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">Open Library</a>.
          </p>
        </div>
      )}
    </section>
  );
}
