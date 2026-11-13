import { useState } from "react";
import "./book.css";

// A typeset cover drawn in CSS, or the Open Library cover for books added
// from search. If the image fails to load, the typeset cover takes over.
export default function BookCover({ book, size = "md" }) {
  const [broken, setBroken] = useState(false);
  if (!book) return null;
  if (book.coverUrl && !broken) {
    return (
      <img
        className={`bookCover bookCoverImg ${size}`}
        src={book.coverUrl}
        alt={`${book.title} by ${book.author}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={`bookCover ${size}`}
      style={{ "--cover": book.coverColor || "#2f7553" }}
      role="img"
      lang="en"
      aria-label={`${book.title} by ${book.author}`}
    >
      <span className="bookCoverTitle">{book.title}</span>
      {size !== "xs" && <span className="bookCoverAuthor">{book.author}</span>}
    </div>
  );
}

export const chapterName = (seq, title) => {
  if (seq === 0) return "Before chapter 1";
  return title && !/^Chapter \d+$/.test(title) ? `Chapter ${seq}: ${title}` : `Chapter ${seq}`;
};

// "Chapter 12 of 61" + a bar. Never goes past 100%.
export function ProgressBar({ chapter = 0, total = 0, label = true }) {
  // Books added from Open Library have no chapter list yet.
  if (!total) return label ? <span className="progressLabel noChapters">No chapter list yet</span> : null;
  const pct = total > 0 ? Math.min(100, Math.round((chapter / total) * 100)) : 0;
  return (
    <div className="progress">
      <div
        className="progressTrack"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(chapter, total)}
        aria-label="Reading progress"
      >
        <div className="progressFill" style={{ width: `${pct}%` }} />
      </div>
      {label && (
        <span className="progressLabel">
          {chapter >= total && total > 0 ? "Finished" : chapter === 0 ? "Not started" : `Chapter ${chapter} of ${total}`}
        </span>
      )}
    </div>
  );
}
