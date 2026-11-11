import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Search } from "@material-ui/icons";
import { errorMessage } from "../../apiCalls";
import "../reading/community.css";

// Wraps each case-insensitive match of `q` in <mark>.
export function highlight(text, q) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts = [];
  let i = 0;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(<mark key={at}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
    at = lower.indexOf(needle, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return parts.map((p, k) => <Fragment key={k}>{p}</Fragment>);
}

// Searches only the discussions you can already read (the server applies
// your chapter), so results never include later chapters.
export default function CircleSearch({ circleId, onResults }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setError("");
    try {
      const res = await axios.get(`/circles/${circleId}/search`, { params: { q: query } });
      setResult(res.data);
      if (onResults) onResults(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setQ("");
    setResult(null);
    setError("");
    if (onResults) onResults(false);
  };

  return (
    <div>
      <form className="searchBar" role="search" aria-label="Search this circle's discussions" onSubmit={submit}>
        <input
          className="input"
          type="search"
          placeholder="Search discussions you've reached…"
          aria-label="Search discussions"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btnSecondary" disabled={busy || q.trim().length < 2}>
          <Search style={{ fontSize: 18 }} /> Search
        </button>
        {result && (
          <button type="button" className="btn btnGhost" onClick={clear}>
            Clear
          </button>
        )}
      </form>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div aria-live="polite">
          {result.results.length === 0 ? (
            <div className="card emptyCard">
              <strong>No matches for “{result.query}”</strong>
              Only discussions up to your current chapter are searched.
            </div>
          ) : (
            <div className="card searchResults" aria-label="Search results">
              {result.results.map((r, i) => (
                <Link key={`${r.threadId}-${i}`} to={`/threads/${r.threadId}`} className="searchHit">
                  <span className="threadRowTitle">
                    <span className="chapterChip">{r.chapterSeq === 0 ? "Intro" : `Ch ${r.chapterSeq}`}</span> {highlight(r.title, result.query)}
                  </span>
                  <span className="searchSnippet">{highlight(r.snippet, result.query)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
