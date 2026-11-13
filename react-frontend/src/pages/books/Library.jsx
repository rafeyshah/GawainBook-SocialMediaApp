import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../../components/layout/Layout";
import BookCover, { ProgressBar } from "../../components/book/BookCover";
import { errorMessage } from "../../apiCalls";
import { SHELF_LABELS } from "./BookPage";
import BookSearch from "./BookSearch";
import "../reading/reading.css";

const TABS = [["reading", "Reading"], ["want", "Want to read"], ["finished", "Finished"]];

const EMPTY_TEXT = {
  reading: "Nothing on the go. Pick a book below to start.",
  want: "Save books you'd like to read next.",
  finished: "Books you finish will appear here.",
};

export default function Library() {
  const [shelves, setShelves] = useState(null);
  const [books, setBooks] = useState([]);
  const [tab, setTab] = useState("reading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, b] = await Promise.all([axios.get("/shelves"), axios.get("/books")]);
      setShelves(s.data);
      setBooks(b.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (bookId, shelf) => {
    try {
      await axios.put(`/books/${bookId}/progress`, { shelf });
      await load();
      setTab(shelf);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const notShelved = books.filter((b) => !b.shelf);
  const list = shelves ? shelves[tab] : [];

  return (
    <Layout>
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">Library</h1>
          <p className="pageSubtitle">Your shelves and progress. Only you can see how far you've read.</p>
        </div>
      </header>

      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Shelves">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" className="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
            {shelves && <span className="tabCount">{shelves[key].length}</span>}
          </button>
        ))}
      </div>

      {!shelves && !error ? (
        <div className="skeleton" style={{ height: 160 }} aria-busy="true" aria-label="Loading library" />
      ) : shelves ? (
        <div role="tabpanel" aria-label={TABS.find(([k]) => k === tab)[1]}>
          {list.length === 0 ? (
            <div className="card emptyCard">{EMPTY_TEXT[tab]}</div>
          ) : (
            <div className="cardGrid libraryGrid">
              {list.map((b) => (
                <Link key={b._id} to={`/books/${b.slug}`} className="card bookTile">
                  <BookCover book={b} size="md" />
                  <span className="rowCardBody">
                    <span className="rowCardTitle">{b.title}</span>
                    <span className="rowCardMeta">{b.author}</span>
                    {tab !== "want" && <ProgressBar chapter={b.chapter} total={b.chapterCount} />}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {notShelved.length > 0 && (
        <section className="section" aria-labelledby="browseTitle">
          <h2 className="sectionTitle" id="browseTitle">
            More books
          </h2>
          <div className="cardList">
            {notShelved.map((b) => (
              <div key={b._id} className="card rowCard">
                <Link to={`/books/${b.slug}`} aria-label={b.title}>
                  <BookCover book={b} size="sm" />
                </Link>
                <div className="rowCardBody">
                  <h3 className="rowCardTitle">
                    <Link to={`/books/${b.slug}`} className="cardTitleLink">
                      {b.title}
                    </Link>
                  </h3>
                  <span className="rowCardMeta">
                    {b.author} · {b.chapterCount} chapters
                  </span>
                  <div className="badges">
                    {SHELF_LABELS.filter(([k]) => k !== "finished").map(([k, label]) => (
                      <button key={k} type="button" className="btn btnSecondary" onClick={() => add(b._id, k)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <BookSearch
        onShelved={(shelf) => {
          load();
          setTab(shelf);
        }}
      />
    </Layout>
  );
}
