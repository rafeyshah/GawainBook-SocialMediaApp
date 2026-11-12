import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../../components/layout/Layout";
import { BlockedReaders } from "../../components/readingProfile/ReadingProfile";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import { MIN_PASSWORD } from "../auth/Auth";
import { ResendVerification } from "../../components/verifyBanner/VerifyBanner";
import "../reading/reading.css";
import "../reading/community.css";
import "./account.css";

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", again: "" });
  const [state, setState] = useState({ status: "idle" });
  const set = (k) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [k]: value }));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.again) {
      setState({ status: "error", message: "New passwords don't match." });
      return;
    }
    setState({ status: "saving" });
    try {
      await axios.put("/account/password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: "", newPassword: "", again: "" });
      setState({ status: "done" });
    } catch (err) {
      setState({ status: "error", message: errorMessage(err) });
    }
  };
  return (
    <form className="settingsSection" onSubmit={submit} aria-label="Change password">
      <h3>Password</h3>
      <p>Changing it signs you out on your other devices.</p>
      <div className="formRow">
        <label className="field">
          Current password
          <input className="input" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={set("currentPassword")} />
        </label>
      </div>
      <div className="formRow">
        <label className="field">
          New password
          <input className="input" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={72} value={form.newPassword} onChange={set("newPassword")} />
        </label>
        <label className="field">
          Confirm new password
          <input className="input" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={72} value={form.again} onChange={set("again")} />
        </label>
      </div>
      {state.status === "error" && (
        <div className="errorBox" role="alert">
          {state.message}
        </div>
      )}
      {state.status === "done" && <div className="noticeBox" role="status">Password changed.</div>}
      <div className="settingsRow">
        <button type="submit" className="btn btnPrimary" disabled={state.status === "saving" || !form.currentPassword || form.newPassword.length < MIN_PASSWORD}>
          {state.status === "saving" ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

function DeleteAccount() {
  const { user, dispatch } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState({ status: "idle" });
  const submit = async (e) => {
    e.preventDefault();
    setState({ status: "deleting" });
    try {
      await axios.delete("/account", { data: { password } });
      dispatch({ type: "LOGOUT" });
    } catch (err) {
      setState({ status: "error", message: errorMessage(err) });
    }
  };
  return (
    <div className="settingsSection">
      <h3>Delete account</h3>
      <p>
        This permanently deletes your profile, posts, photos, discussions, replies and reading progress. Circles you organise pass to their
        moderator, or their longest-standing member. Download your data first if you'd like a copy.
      </p>
      {!open ? (
        <div className="settingsRow">
          <button type="button" className="btn btnSecondary" onClick={() => setOpen(true)}>
            Delete my account…
          </button>
        </div>
      ) : (
        <form className="dangerZone" onSubmit={submit} aria-label="Delete account">
          <label className="field">
            Type your username, <strong>{user.username}</strong>, to confirm
            <input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            Your password
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {state.status === "error" && (
            <div className="errorBox" role="alert">
              {state.message}
            </div>
          )}
          <div className="formActions">
            <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btnDanger" disabled={confirmName !== user.username || !password || state.status === "deleting"}>
              {state.status === "deleting" ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Settings() {
  const { user } = useContext(AuthContext);
  return (
    <Layout width="reading" aside={<BlockedReaders />}>
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">Settings</h1>
          <p className="pageSubtitle">Your account, password and data.</p>
        </div>
      </header>
      <section className="card cardPad" aria-label="Account settings">
        <div className="settingsSection">
          <h3>Email</h3>
          <div className="settingsRow">
            <span>{user.email}</span>
            {user.emailVerified ? <span className="statusPill">Confirmed</span> : <span className="statusPill warn">Not confirmed yet</span>}
          </div>
          {!user.emailVerified && (
            <>
              <p>We sent you a link when you signed up. Confirming means you can reset your password if you ever forget it.</p>
              <div className="settingsRow">
                <ResendVerification />
              </div>
            </>
          )}
        </div>

        <ChangePassword />

        <div className="settingsSection">
          <h3>Your data</h3>
          <p>Download everything GawainBook stores about your account as a JSON file.</p>
          <div className="settingsRow">
            <a className="btn btnSecondary" href={`${axios.defaults.baseURL || "/api"}/account/export`} download>
              Download my data
            </a>
          </div>
        </div>

        <div className="settingsSection">
          <h3>Profile</h3>
          <p>
            Your photo, cover, bio and reading profile are edited on <Link to={`/profile/${user.username}`}>your profile</Link>.
          </p>
        </div>

        <DeleteAccount />
      </section>
      <p className="sourceNote">
        <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/impressum">Impressum</Link>
      </p>
    </Layout>
  );
}
