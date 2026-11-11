import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import BookCover, { ProgressBar } from "../book/BookCover";
import "./rail.css";

// Side panel for reading-focused pages (feed, discussions): what you're
// reading and your circles, one click away.
export default function ReadingRail() {
  const [data, setData] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([axios.get("/books"), axios.get("/circles")])
      .then(([books, circles]) => {
        if (cancelled) return;
        const list = Array.isArray(books.data) ? books.data : [];
        setData({ reading: list.filter((b) => b.shelf === "reading"), circles: circles.data?.mine || [] });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="railNote">Couldn't load your reading right now.</p>;
  if (!data) return <div className="skeleton railSkeleton" aria-busy="true" aria-label="Loading your reading" />;

  return (
    <>
      <section className="card railCard" aria-labelledby="railReading">
        <h2 className="railTitle" id="railReading">
          Continue reading
        </h2>
        {data.reading.length === 0 ? (
          <p className="railNote">
            Nothing on the go. Find a book in the <Link to="/library">library</Link>.
          </p>
        ) : (
          <ul className="railList">
            {data.reading.map((b) => (
              <li key={b._id}>
                <Link to={`/books/${b.slug}`} className="railItem">
                  <BookCover book={b} size="xs" />
                  <span className="railItemBody">
                    <span className="railItemTitle">{b.title}</span>
                    <ProgressBar chapter={b.chapter} total={b.chapterCount} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card railCard" aria-labelledby="railCircles">
        <h2 className="railTitle" id="railCircles">
          Your circles
        </h2>
        {data.circles.length === 0 ? (
          <p className="railNote">
            You're not in a circle yet. <Link to="/">Find one</Link>.
          </p>
        ) : (
          <ul className="railList">
            {data.circles.map((c) => (
              <li key={c._id}>
                <Link to={`/circles/${c._id}`} className="railItem">
                  <BookCover book={c.book} size="xs" />
                  <span className="railItemBody">
                    <span className="railItemTitle">{c.name}</span>
                    <span className="railItemMeta">
                      {c.openThreads === 1 ? "1 discussion open" : `${c.openThreads} discussions open`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
