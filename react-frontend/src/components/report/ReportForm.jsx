import { useState } from "react";
import axios from "axios";
import { errorMessage } from "../../apiCalls";

export const REASONS = [
  ["spoiler", "Spoiler for a later chapter"],
  ["harassment", "Unkind or harassing"],
  ["spam", "Spam or advertising"],
  ["other", "Something else"],
];

const NOUN = { thread: "discussion", comment: "reply", post: "post", post_comment: "comment", user: "profile" };

// Report a discussion or reply (to the circle's moderators), or a post or
// profile (to the site's admins).
export default function ReportForm({ targetType, targetId, onDone, onCancel }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await axios.post("/reports", { targetType, targetId, reason, details: details.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  };

  return (
    <form className="reportForm" onSubmit={submit} aria-label={`Report this ${NOUN[targetType] || "item"}`}>
      <fieldset>
        <legend>What's wrong?</legend>
        {REASONS.map(([value, label]) => (
          <label key={value} className="radioRow">
            <input type="radio" name={`reason-${targetId}`} value={value} checked={reason === value} onChange={() => setReason(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="field">
        Anything the moderators should know? (optional)
        <textarea className="input" rows={2} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <p className="sourceNote">
        {targetType === "post" || targetType === "user" || targetType === "post_comment"
          ? "GawainBook's moderators review reports about posts and profiles. The reader isn't told who reported them."
          : "Only the circle's organiser and moderators see reports. The writer isn't told who reported them."}
      </p>
      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}
      <div className="formActions">
        <button type="button" className="btn btnGhost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btnPrimary" disabled={!reason || sending}>
          {sending ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}
