import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Search, Check } from "@material-ui/icons";
import BookCover from "../../components/book/BookCover";
import { errorMessage } from "../../apiCalls";
import "../reading/community.css";

export const SHELF_NAMES = { want: "Want to read", reading: "Reading", finished: "Finished" };
const QUICK_SHELVES = ["want", "reading"];

// "Want to read" / "Reading" buttons for a search result, or "On your shelf"
// once it's there (with a way to move it).
function ShelfButtons({ title, shelf, busy, onPick, onRemove, link }) {
  if (shelf) {
    return (
      <div className="shelfResult">
        <span className="shelfDone" role="status">
          <Check style={{ fontSize: 15 }} /> {SHELF_NAMES[shelf]}
        </span>
        {link && (
          <Link className="linkBtn" to={link}>
            Open
          </Link>
        )}
        {QUICK_SHELVES.filter((s) => s !== shelf).map((s) => (
          <button key={s} type="button" className="linkBtn" disabled={busy} onClick={() => onPick(s)} aria-label={`Move ${title} to ${SHELF_NAMES[s]}`}>
            Move to {SHELF_NAMES[s]}
          </button>
        ))}
        {onRemove && (
          <button type="button" className="linkBtn danger" disabled={busy} onClick={onRemove} aria-label={`Remove ${title} from your shelves`}>
            Remove
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="shelfButtons">
      {QUICK_SHELVES.map((s) => (
        <button
          key={s}
          type="button"
          className={`btn ${s === "want" ? "btnSecondary" : "btnGhost"} btnSmall`}
          disabled={busy}
          onClick={() => onPick(s)}
          aria-label={`Add ${title} to ${SHELF_NAMES[s]}`}
        >
          {busy === s ? "Adding…" : SHELF_NAMES[s]}
        </button>
      ))}
    </div>
  );
}

// Search our books (ready for circles) and Open Library (for discovery), and
// put any result straight on a shelf.
export default function BookSearch({ onShelved }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Per result: { shelf, busy, error, slug }
  const [state, setState] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setError("");
    setState({});
    try {
      setResult((await axios.get("/books/search", { params: { q: query } })).data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = (id, change) => setState((s) => ({ ...s, [id]: { ...s[id], ...change } }));

  // One of our books: just set the shelf.
  const shelveLocal = async (b, shelf) => {
    patch(b._id, { busy: shelf, error: "" });
    try {
      const res = await axios.put(`/books/${b._id}/progress`, { shelf });
      patch(b._id, { busy: false, shelf: res.data.shelf });
      if (onShelved) onShelved(res.data.shelf);
    } catch (err) {
      patch(b._id, { busy: false, error: errorMessage(err) });
    }
  };

  // Take a book off your shelves (it stays in GawainBook for others).
  const unshelve = async (id, bookId) => {
    patch(id, { busy: "remove", error: "" });
    try {
      await axios.delete(`/books/${bookId}/progress`);
      patch(id, { busy: false, shelf: null, removed: true });
      if (onShelved) onShelved(null);
    } catch (err) {
      patch(id, { busy: false, error: errorMessage(err) });
    }
  };

  // An Open Library book: the server adds it to GawainBook, then shelves it.
  const shelveOpenLibrary = async (b, shelf) => {
    patch(b.key, { busy: shelf, error: "" });
    try {
      const res = await axios.post("/books/import", { key: b.key, shelf });
      patch(b.key, { busy: false, shelf: res.data.shelf, slug: res.data.book.slug, bookId: res.data.book._id });
      if (onShelved) onShelved(res.data.shelf);
    } catch (err) {
      patch(b.key, { busy: false, error: errorMessage(err) });
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
              <h3 className="subhead">On GawainBook</h3>
              <ul className="olGrid" aria-label="Books on GawainBook" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.local.map((b) => {
                  const st = state[b._id] || {};
                  return (
                    <li key={b._id} className="olBook">
                      <Link to={`/books/${b.slug}`} aria-label={b.title} className="olCoverLink">
                        <BookCover book={b} size="md" />
                      </Link>
                      <Link to={`/books/${b.slug}`} className="olTitle">
                        {b.title}
                      </Link>
                      <span className="olMeta">
                        {b.author}
                        {b.chapterCount ? ` · ${b.chapterCount} chapters` : ""}
                      </span>
                      {b.chaptersAvailable ? <span className="olBadge">Ready for circles</span> : null}
                      <ShelfButtons
                        title={b.title}
                        shelf={st.removed ? st.shelf : st.shelf ?? b.shelf}
                        busy={st.busy}
                        onPick={(s) => shelveLocal(b, s)}
                        onRemove={() => unshelve(b._id, b._id)}
                      />
                      {st.error && (
                        <span className="errorBox" role="alert">
                          {st.error}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
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
              <p className="sourceNote">Add any book to your shelves. Reading circles need a chapter list, so these can't be read in a circle yet.</p>
              <ul className="olGrid" aria-label="Open Library results" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.openLibrary.map((b) => {
                  const st = state[b.key] || {};
                  return (
                    <li key={b.key} className="olBook">
                      {b.coverUrl ? (
                        <img src={b.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
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
                      <ShelfButtons
                        title={b.title}
                        shelf={st.shelf}
                        busy={st.busy}
                        onPick={(s) => shelveOpenLibrary(b, s)}
                        onRemove={st.bookId ? () => unshelve(b.key, st.bookId) : null}
                        link={st.slug ? `/books/${st.slug}` : null}
                      />
                      {st.error && (
                        <span className="errorBox" role="alert">
                          {st.error}
                        </span>
                      )}
                    </li>
                  );
                })}
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
