import "./book.css";

// A typeset cover drawn in CSS: no cover images, so no image rights to clear.
export default function BookCover({ book, size = "md" }) {
  if (!book) return null;
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
