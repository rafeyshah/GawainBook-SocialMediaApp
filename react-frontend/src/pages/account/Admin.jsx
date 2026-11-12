import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Redirect } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import Layout from "../../components/layout/Layout";
import { REASONS } from "../../components/report/ReportForm";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import "../reading/reading.css";
import "../reading/community.css";
import "./account.css";

const reasonLabel = Object.fromEntries(REASONS);

// Site-wide moderation: reports about posts and profiles.
export default function Admin() {
  const { user } = useContext(AuthContext);
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([axios.get("/admin/stats"), axios.get("/admin/reports")]);
      setStats(s.data);
      setReports(r.data);
    } catch (err) {
      setError(errorMessage(err));
      setReports([]);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user, load]);

  if (!user?.isAdmin) return <Redirect to="/" />;

  const act = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Layout>
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">Admin</h1>
          <p className="pageSubtitle">Reports about posts and profiles. Circle discussions are moderated inside each circle.</p>
        </div>
      </header>

      {stats && (
        <div className="statGrid" aria-label="Site numbers">
          {[
            ["Readers", stats.users],
            ["Circles", stats.circles],
            ["Open reports", stats.openReports],
            ["Suspended", stats.suspended],
          ].map(([label, n]) => (
            <div key={label} className="card statTile">
              <strong>{n}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="errorBox" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      <section className="section" aria-labelledby="adminReports">
        <h2 className="sectionTitle" id="adminReports">
          Open reports
        </h2>
        {reports === null ? (
          <div className="skeleton" style={{ height: 120 }} aria-label="Loading reports" />
        ) : reports.length === 0 ? (
          <div className="card emptyCard">
            <strong>All clear</strong>
            No open reports.
          </div>
        ) : (
          <ul className="manageList" aria-label="Reports to review">
            {reports.map((r) => (
              <li key={r._id} className="card cardPad reportItem">
                <span>
                  <strong>{reasonLabel[r.reason] || r.reason}</strong>
                  <span className="memberMeta">
                    {" "}
                    · {r.targetType === "post" ? `post by ${r.target.author.username}` : r.targetType === "post_comment" ? `comment by ${r.target.author.username}` : `profile of ${r.target.username}`} · reported by{" "}
                    {r.reporter.username} {format(r.createdAt)}
                  </span>
                </span>
                {r.targetType === "post" || r.targetType === "post_comment" ? (
                  <blockquote className="reportQuote">{r.target.text || "(photo only)"}</blockquote>
                ) : (
                  <blockquote className="reportQuote">{r.target.bio || "(no bio)"}</blockquote>
                )}
                {r.details && <span className="memberMeta">Note: {r.details}</span>}
                <div className="itemActions">
                  <Link className="linkBtn" to={r.targetType === "post_comment" ? `/posts/${r.target.postId}` : `/profile/${r.targetType === "post" ? r.target.author.username : r.target.username}`}>
                    {r.targetType === "post_comment" ? "Open post" : "Open profile"}
                  </Link>
                  {r.targetType === "post_comment" && (
                    <button type="button" className="linkBtn danger" onClick={() => act(() => axios.delete(`/admin/post-comments/${r.target._id}`), "Delete this comment?")}>
                      Delete comment
                    </button>
                  )}
                  {r.targetType === "post" && (
                    <button type="button" className="linkBtn danger" onClick={() => act(() => axios.delete(`/admin/posts/${r.target._id}`), "Delete this post?")}>
                      Delete post
                    </button>
                  )}
                  <button
                    type="button"
                    className="linkBtn danger"
                    onClick={() => {
                      const who = r.targetType === "user" ? r.target : r.target.author;
                      act(() => axios.post(`/admin/users/${who._id}/suspend`), `Suspend ${who.username}? They'll be signed out and hidden from everyone.`);
                    }}
                  >
                    Suspend {r.targetType === "user" ? r.target.username : r.target.author.username}
                  </button>
                  <button type="button" className="linkBtn" onClick={() => act(() => axios.post(`/admin/reports/${r._id}/dismiss`))}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>
  );
}
