import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import PublicLayout from "./PublicLayout";
import useLegal from "../../useLegal";
import { errorMessage } from "../../apiCalls";

// Keep in sync with GENRES in Node-Rest-API/src/routes/waitlist.ts.
export const GENRE_OPTIONS = [
  ["fantasy", "Fantasy"],
  ["romantasy", "Romantasy"],
  ["romance", "Romance"],
  ["science-fiction", "Science fiction"],
  ["mystery-thriller", "Mystery & thriller"],
  ["literary", "Literary fiction"],
  ["classics", "Classics"],
  ["non-fiction", "Non-fiction"],
  ["other", "Something else"],
];

const EMPTY = { email: "", favouriteGenre: "", organizesBookClub: null, consent: false, website: "" };

export default function Waitlist() {
  const legal = useLegal();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [sending, setSending] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.organizesBookClub === null) {
      setError("Please tell us whether you organise a book club.");
      return;
    }
    if (!form.consent) {
      setError("Please agree to the privacy notice to join.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await axios.post("/waitlist", { ...form, email: form.email.trim() });
      setDone(res.data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  let body;
  if (legal.status === "loading") {
    body = <p className="publicLead" aria-busy="true">Loading…</p>;
  } else if (done) {
    body = (
      <div role="status">
        <p className="publicNote">{done}</p>
        <p>
          <Link to="/">Back to GawainBook</Link>
        </p>
      </div>
    );
  } else if (!legal.waitlistOpen) {
    body = (
      <p className="publicNote">
        We're getting ready. The waitlist opens soon. In the meantime you can still{" "}
        <Link to="/register">create an account</Link>.
      </p>
    );
  } else {
    body = (
      <form className="wlForm" onSubmit={submit}>
        <div className="wlField">
          <label htmlFor="wlEmail">Email</label>
          <input
            id="wlEmail"
            className="wlInput"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={form.email}
            onChange={set("email")}
          />
        </div>

        <div className="wlField">
          <label htmlFor="wlGenre">Favourite genre</label>
          <select id="wlGenre" className="wlInput" required value={form.favouriteGenre} onChange={set("favouriteGenre")}>
            <option value="" disabled>
              Choose one
            </option>
            {GENRE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="wlField">
          <legend>Do you organise a book club?</legend>
          <div className="wlChoices">
            {[
              [true, "Yes"],
              [false, "No"],
            ].map(([value, label]) => (
              <label key={label}>
                <input
                  type="radio"
                  name="organizesBookClub"
                  checked={form.organizesBookClub === value}
                  onChange={() => setForm((f) => ({ ...f, organizesBookClub: value }))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="wlTrap" aria-hidden="true">
          <label htmlFor="wlWebsite">Leave this empty</label>
          <input id="wlWebsite" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
        </div>

        <label className="wlConsent">
          <input type="checkbox" checked={form.consent} onChange={set("consent")} />
          <span>
            I agree that GawainBook may store these details to contact me about the beta, as described in the{" "}
            <Link to="/privacy">privacy notice</Link>. I can withdraw at any time.
          </span>
        </label>

        {error && (
          <div className="errorBox" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btnPrimary wlSubmit" disabled={sending}>
          {sending ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
    );
  }

  return (
    <PublicLayout>
      <h1>Join the waitlist</h1>
      <p className="publicLead">
        GawainBook is building reading circles: small groups reading the same book, with spoiler-safe chapter
        discussions. Be one of the first to try them.
      </p>
      {body}
    </PublicLayout>
  );
}
