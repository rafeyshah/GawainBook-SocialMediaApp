import { useState } from "react";
import axios from "axios";
import { errorMessage } from "../../apiCalls";
import { chapterName } from "./BookCover";

// Lets a reader set the chapter they've reached. Calls onSaved(result) with
// { shelf, chapter, chapterCount } from the server.
export default function ProgressEditor({ book, chapter, chapters, onSaved, compact = false }) {
  const total = book.chapterCount;
  const [value, setValue] = useState(chapter);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (next) => {
    setSaving(true);
    setError("");
    try {
      const res = await axios.put(`/books/${book._id}/progress`, { chapter: next });
      setValue(res.data.chapter);
      if (onSaved) onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err));
      setValue(chapter);
    } finally {
      setSaving(false);
    }
  };

  const options = chapters && chapters.length ? chapters : Array.from({ length: total }, (_, i) => ({ seq: i + 1 }));
  if (!total) return null;

  return (
    <div className={`progressEditor ${compact ? "compact" : ""}`}>
      <label className="srOnly" htmlFor={`chapter-${book._id}`}>
        Chapter you've reached in {book.title}
      </label>
      <select
        id={`chapter-${book._id}`}
        className="progressSelect"
        value={value}
        disabled={saving}
        onChange={(e) => {
          const next = Number(e.target.value);
          setValue(next);
          save(next);
        }}
      >
        <option value={0}>Not started</option>
        {options.map((c) => (
          <option key={c.seq} value={c.seq}>
            {chapterName(c.seq, c.title)}
          </option>
        ))}
      </select>
      {value < total && (
        <button type="button" className="btn btnSecondary" disabled={saving} onClick={() => save(value + 1)}>
          +1 chapter
        </button>
      )}
      {error && (
        <span className="progressError" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
