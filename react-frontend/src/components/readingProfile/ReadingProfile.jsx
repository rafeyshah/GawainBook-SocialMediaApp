import { useContext, useEffect, useState } from "react";
import axios from "axios";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import Avatar from "../avatar/Avatar";
import "../../pages/reading/community.css";

// Genres readers pick most in fantasy/romance communities; anything else can
// be typed in.
export const SUGGESTED_GENRES = [
  "Romance",
  "Romantasy",
  "Fantasy",
  "Classics",
  "Historical fiction",
  "Mystery",
  "Thriller",
  "Sci-fi",
  "Literary fiction",
  "Contemporary",
  "Horror",
  "Non-fiction",
];
export const LANGUAGES = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  pl: "Polish",
  tr: "Turkish",
  ur: "Urdu",
  hi: "Hindi",
  ar: "Arabic",
};
export const MAX_GENRES = 8;

export const paceLabel = (pace) => (pace ? `${pace} ${pace === 1 ? "chapter" : "chapters"} a week` : "");

function Editor({ profile, onSaved, onCancel }) {
  const { dispatch } = useContext(AuthContext);
  const [genres, setGenres] = useState(profile.favoriteGenres || []);
  const [custom, setCustom] = useState("");
  const [language, setLanguage] = useState(profile.readingLanguage || "");
  const [pace, setPace] = useState(profile.pace ? String(profile.pace) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const has = (g) => genres.some((x) => x.toLowerCase() === g.toLowerCase());
  const toggle = (g) => setGenres((list) => (has(g) ? list.filter((x) => x.toLowerCase() !== g.toLowerCase()) : [...list, g]));
  const addCustom = () => {
    const g = custom.trim().replace(/\s+/g, " ");
    if (!g) return;
    if (!has(g)) setGenres((list) => [...list, g]);
    setCustom("");
  };
  const full = genres.length >= MAX_GENRES;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = { favoriteGenres: genres, readingLanguage: language || null, pace: pace ? Number(pace) : null };
    try {
      const res = await axios.put(`/users/${profile._id}`, body);
      const saved = { favoriteGenres: res.data.favoriteGenres, readingLanguage: res.data.readingLanguage, pace: res.data.pace };
      dispatch({ type: "UPDATE_USER", payload: saved });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const allGenres = [...SUGGESTED_GENRES, ...genres.filter((g) => !SUGGESTED_GENRES.some((s) => s.toLowerCase() === g.toLowerCase()))];
  return (
    <form className="inlineForm" onSubmit={submit} aria-label="Edit reading profile">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field" style={{ marginBottom: 8 }}>
          Favourite genres <span className="memberMeta">({genres.length}/{MAX_GENRES})</span>
        </legend>
        <div className="genreChips">
          {allGenres.map((g) => (
            <button key={g} type="button" className="genreChip" aria-pressed={has(g)} disabled={!has(g) && full} onClick={() => toggle(g)}>
              {g}
            </button>
          ))}
        </div>
        <div className="searchBar" style={{ marginTop: 8 }}>
          <input
            className="input"
            aria-label="Add another genre"
            placeholder="Add another genre"
            maxLength={30}
            value={custom}
            disabled={full}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button type="button" className="btn btnGhost" onClick={addCustom} disabled={full || !custom.trim()}>
            Add
          </button>
        </div>
      </fieldset>
      <div className="formRow">
        <label className="field">
          I mostly read in
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Not set</option>
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Usual pace (chapters a week)
          <input className="input" type="number" min={1} max={100} step={1} value={pace} onChange={(e) => setPace(e.target.value)} placeholder="e.g. 5" />
        </label>
      </div>
      <p className="sourceNote">All optional. Others see this on your profile, which helps find readers who read at your speed.</p>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      <div className="formActions">
        <button type="button" className="btn btnGhost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btnPrimary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Genres, language and pace on a profile; editable on your own.
export default function ReadingProfile({ profile, isMe, onChange }) {
  const [editing, setEditing] = useState(false);
  const genres = profile.favoriteGenres || [];
  const empty = !genres.length && !profile.readingLanguage && !profile.pace;
  if (empty && !isMe) return null;

  return (
    <section className="section" aria-labelledby="readingProfileTitle">
      <div className="sectionHead">
        <h2 className="sectionTitle" id="readingProfileTitle">
          Reading profile
        </h2>
        {isMe && !editing && (
          <button type="button" className="btn btnGhost" onClick={() => setEditing(true)}>
            {empty ? "Add" : "Edit"}
          </button>
        )}
      </div>
      <div className="card cardPad">
        {editing ? (
          <Editor
            profile={profile}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              onChange(saved);
              setEditing(false);
            }}
          />
        ) : empty ? (
          <p className="sourceNote" style={{ margin: 0 }}>
            Tell other readers what you like to read, in which language and how fast.
          </p>
        ) : (
          <dl className="factList">
            {genres.length > 0 && (
              <>
                <dt>Loves</dt>
                <dd>
                  <span className="genreChips">
                    {genres.map((g) => (
                      <span key={g} className="genreChip">
                        {g}
                      </span>
                    ))}
                  </span>
                </dd>
              </>
            )}
            {profile.readingLanguage && (
              <>
                <dt>Reads in</dt>
                <dd>{LANGUAGES[profile.readingLanguage] || profile.readingLanguage}</dd>
              </>
            )}
            {profile.pace && (
              <>
                <dt>Pace</dt>
                <dd>{paceLabel(profile.pace)}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}

// Block or unblock a reader from their profile.
export function BlockButton({ profile, onBlocked }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const block = async () => {
    if (!window.confirm(`Block ${profile.username}? You won't see each other's discussions, replies or posts, and any follows between you end.`)) return;
    setBusy(true);
    setError("");
    try {
      await axios.put(`/blocks/${profile._id}`);
      // The button goes away once blocked, so only reset it on failure.
      onBlocked();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="linkBtn danger" onClick={block} disabled={busy}>
        Block {profile.username}
      </button>
      {error && (
        <span className="profileFollowError" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

// Your blocked readers, with Unblock.
export function BlockedReaders() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    axios
      .get("/blocks")
      .then((res) => live && setList(Array.isArray(res.data) ? res.data : []))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, []);
  if (!list || list.length === 0) return null;
  const unblock = async (u) => {
    setError("");
    try {
      await axios.delete(`/blocks/${u._id}`);
      setList((l) => l.filter((x) => x._id !== u._id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section className="section" aria-labelledby="blockedTitle">
      <h2 className="sectionTitle" id="blockedTitle">
        Blocked readers
      </h2>
      <div className="card cardPad">
        <ul className="manageList">
          {list.map((u) => (
            <li key={u._id} className="manageItem">
              <Avatar user={u} size={26} />
              <span className="grow">{u.username}</span>
              <button type="button" className="linkBtn" onClick={() => unblock(u)}>
                Unblock
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <div className="errorBox" role="alert" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
