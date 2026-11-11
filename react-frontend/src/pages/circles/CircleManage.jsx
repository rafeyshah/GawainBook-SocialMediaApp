import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import Avatar from "../../components/avatar/Avatar";
import { REASONS } from "../../components/report/ReportForm";
import { errorMessage } from "../../apiCalls";
import "../reading/community.css";

export const DAY_OPTIONS = [1, 7, 14, 30];
export const USE_OPTIONS = [["", "Unlimited"], ["1", "1 person"], ["5", "5 people"], ["10", "10 people"], ["25", "25 people"]];
const reasonLabel = Object.fromEntries(REASONS);

export const inviteUrl = (code, origin = window.location.origin) => `${origin}/join/${code}`;
// Short form for display; the full URL is what gets copied.
export const shortInvite = (code) => `…/join/${code}`;

export function expiryLabel(iso, now = Date.now()) {
  const days = Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
  if (days <= 0) return "expires today";
  return days === 1 ? "expires in 1 day" : `expires in ${days} days`;
}

function InviteLinks({ circleId }) {
  const [links, setLinks] = useState(null);
  const [days, setDays] = useState("7");
  const [uses, setUses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      setLinks((await axios.get(`/circles/${circleId}/invitations`)).data);
    } catch (err) {
      setError(errorMessage(err));
      setLinks([]);
    }
  }, [circleId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await axios.post(`/circles/${circleId}/invitations`, { expiresInDays: Number(days), maxUses: uses ? Number(uses) : null });
      setLinks((l) => [res.data, ...(l || [])]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv) => {
    setError("");
    try {
      await axios.delete(`/circles/${circleId}/invitations/${inv._id}`);
      setLinks((l) => l.filter((x) => x._id !== inv._id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const copy = async (inv) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(inv.code));
      setCopied(inv._id);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <div className="organiseBlock">
      <h3 className="subhead">Invite links</h3>
      <form className="inviteForm" onSubmit={create} aria-label="Create an invite link">
        <label className="field">
          Valid for
          <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 day" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Can be used by
          <select className="input" value={uses} onChange={(e) => setUses(e.target.value)}>
            {USE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="formActions">
          <button type="submit" className="btn btnSecondary" disabled={busy}>
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>
      </form>
      {error && (
        <div className="errorBox" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      {links && links.length > 0 && (
        <ul className="manageList" style={{ marginTop: 12 }} aria-label="Active invite links">
          {links.map((inv) => (
            <li key={inv._id} className="manageItem noAvatar">
              <span className="grow">
                <span className="inviteLink" title={inviteUrl(inv.code)}>
                  {shortInvite(inv.code)}
                </span>
                <span className="memberMeta">
                  {expiryLabel(inv.expiresAt)} · {inv.maxUses ? `${inv.uses} of ${inv.maxUses} used` : `${inv.uses} used`}
                </span>
              </span>
              <span className="manageActions">
                <button type="button" className="linkBtn" onClick={() => copy(inv)}>
                  {copied === inv._id ? "Copied" : "Copy link"}
                </button>
                <button type="button" className="linkBtn danger" onClick={() => revoke(inv)} aria-label={`Turn off link ${inv.code}`}>
                  Turn off
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {links && links.length === 0 && !error && <p className="sourceNote">No active links. Links expire, so it's safe to share them in a group chat.</p>}
    </div>
  );
}

function Members({ circle, meId, onChanged }) {
  const [error, setError] = useState("");
  const isOwner = circle.myRole === "owner";
  const act = async (fn) => {
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const others = circle.members.filter((m) => m._id !== meId && m.role !== "owner");
  return (
    <div className="organiseBlock">
      <h3 className="subhead">Members</h3>
      {others.length === 0 ? (
        <p className="sourceNote">Nobody else has joined yet.</p>
      ) : (
        <ul className="manageList" aria-label="Manage members">
          {others.map((m) => (
            <li key={m._id} className="manageItem">
              <Avatar user={m} size={26} />
              <span className="grow">
                {m.username} <span className="memberMeta">{m.role === "moderator" ? "Moderator" : "Member"}</span>
              </span>
              <span className="manageActions">
              {isOwner && (
                <button
                  type="button"
                  className="linkBtn"
                  onClick={() => act(() => axios.put(`/circles/${circle._id}/members/${m._id}`, { role: m.role === "moderator" ? "member" : "moderator" }))}
                >
                  {m.role === "moderator" ? "Make member" : "Make moderator"}
                </button>
              )}
              {(isOwner || m.role === "member") && (
                <button
                  type="button"
                  className="linkBtn danger"
                  aria-label={`Remove ${m.username}`}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.username} from the circle? They'll lose access straight away.`)) {
                      act(() => axios.delete(`/circles/${circle._id}/members/${m._id}`));
                    }
                  }}
                >
                  Remove
                </button>
              )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="errorBox" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Reports({ circleId, onChanged }) {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setReports((await axios.get(`/circles/${circleId}/reports`)).data);
    } catch (err) {
      setError(errorMessage(err));
      setReports([]);
    }
  }, [circleId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="organiseBlock">
      <h3 className="subhead">Reports</h3>
      {reports === null ? (
        <div className="skeleton" style={{ height: 40 }} aria-label="Loading reports" />
      ) : reports.length === 0 ? (
        <p className="sourceNote">No open reports. 🎉</p>
      ) : (
        <ul className="manageList" aria-label="Open reports">
          {reports.map((r) => (
            <li key={r._id} className="reportItem">
              <span>
                <strong>{reasonLabel[r.reason] || r.reason}</strong>
                <span className="memberMeta">
                  {" "}
                  · {r.targetType === "thread" ? "discussion" : "reply"} by {r.target.author.username} in chapter {r.target.chapterSeq} · reported {format(r.createdAt)}
                </span>
              </span>
              <blockquote className="reportQuote">{r.target.title ? `${r.target.title}\n${r.target.text}` : r.target.text}</blockquote>
              {r.details && <span className="memberMeta">Note: {r.details}</span>}
              <div className="itemActions">
                <Link className="linkBtn" to={`/threads/${r.target.threadId}`}>
                  Open
                </Link>
                <button type="button" className="linkBtn danger" onClick={() => act(() => axios.post(`/${r.targetType === "thread" ? "threads" : "comments"}/${r.targetId}/hide`))}>
                  Hide it
                </button>
                <button type="button" className="linkBtn" onClick={() => act(() => axios.post(`/reports/${r._id}/dismiss`))}>
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="errorBox" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// Tools for the circle's owner and moderators.
export default function CircleManage({ circle, meId, onChanged }) {
  return (
    <section className="section" aria-labelledby="manageTitle">
      <h2 className="sectionTitle" id="manageTitle">
        Organise{circle.openReports ? ` · ${circle.openReports} to review` : ""}
      </h2>
      <div className="card cardPad">
        <Reports circleId={circle._id} onChanged={onChanged} />
        <InviteLinks circleId={circle._id} />
        <Members circle={circle} meId={meId} onChanged={onChanged} />
      </div>
    </section>
  );
}
