import { useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import PublicLayout from "../public/PublicLayout";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import { MIN_PASSWORD } from "../auth/Auth";
import "./account.css";

const tokenFromSearch = (search) => new URLSearchParams(search).get("token") || "";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ status: "idle" }); // idle | sending | sent | error
  const submit = async (e) => {
    e.preventDefault();
    setState({ status: "sending" });
    try {
      const res = await axios.post("/auth/forgot-password", { email: email.trim() });
      setState({ status: "sent", message: res.data.message });
    } catch (err) {
      setState({ status: "error", message: errorMessage(err) });
    }
  };
  return (
    <PublicLayout>
      <h1>Forgot your password?</h1>
      {state.status === "sent" ? (
        <>
          <p className="accountNotice" role="status">
            {state.message}
          </p>
          <p className="publicNote">The link works for one hour. Didn't get it? Check the address and try again in a minute.</p>
          <Link to="/login" className="btn btnSecondary">
            Back to sign in
          </Link>
        </>
      ) : (
        <form className="accountForm" onSubmit={submit} aria-label="Reset your password">
          <p className="publicLead">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
          <label className="accountField">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {state.status === "error" && (
            <p className="accountError" role="alert">
              {state.message}
            </p>
          )}
          <button type="submit" className="btn btnPrimary" disabled={state.status === "sending" || !email.trim()}>
            {state.status === "sending" ? "Sending…" : "Send reset link"}
          </button>
          <Link to="/login" className="accountBack">
            Back to sign in
          </Link>
        </form>
      )}
    </PublicLayout>
  );
}

export function ResetPassword() {
  const { search } = useLocation();
  const token = tokenFromSearch(search);
  const { dispatch } = useContext(AuthContext);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState({ status: "idle" });

  const submit = async (e) => {
    e.preventDefault();
    if (password !== again) {
      setState({ status: "error", message: "Passwords don't match." });
      return;
    }
    setState({ status: "saving" });
    try {
      const res = await axios.post("/auth/reset-password", { token, password });
      setState({ status: "done" });
      // The server signed us in: tell the app.
      dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
    } catch (err) {
      setState({ status: "error", message: errorMessage(err) });
    }
  };

  if (!token) {
    return (
      <PublicLayout>
        <h1>This link isn't complete</h1>
        <p className="publicLead">Open the link from the email again, or ask for a new one.</p>
        <Link to="/forgot-password" className="btn btnPrimary">
          Ask for a new link
        </Link>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout>
      <h1>Choose a new password</h1>
      {state.status === "done" ? (
        <>
          <p className="accountNotice" role="status">
            Your password is changed and you're signed in. Any other devices have been signed out.
          </p>
          <Link to="/" className="btn btnPrimary">
            Go to your circles
          </Link>
        </>
      ) : (
        <form className="accountForm" onSubmit={submit} aria-label="Choose a new password">
          <label className="accountField">
            New password
            <input type="password" required minLength={MIN_PASSWORD} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="accountField">
            Confirm new password
            <input type="password" required minLength={MIN_PASSWORD} maxLength={72} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
          <p className="publicNote">At least {MIN_PASSWORD} characters.</p>
          {state.status === "error" && (
            <p className="accountError" role="alert">
              {state.message}{" "}
              {/link/i.test(state.message) && <Link to="/forgot-password">Ask for a new link</Link>}
            </p>
          )}
          <button type="submit" className="btn btnPrimary" disabled={state.status === "saving" || password.length < MIN_PASSWORD}>
            {state.status === "saving" ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </PublicLayout>
  );
}

export function VerifyEmail() {
  const { search } = useLocation();
  const token = tokenFromSearch(search);
  const { user, dispatch } = useContext(AuthContext);
  const [state, setState] = useState({ status: token ? "verifying" : "error", message: "This link isn't complete. Open it from the email again." });
  const started = useRef(false);

  useEffect(() => {
    // Run once, even in React's strict double-invoke: tokens are single-use.
    if (!token || started.current) return;
    started.current = true;
    axios
      .post("/auth/verify-email", { token })
      .then(() => {
        setState({ status: "done" });
        if (user) dispatch({ type: "UPDATE_USER", payload: { emailVerified: true } });
      })
      .catch((err) => setState({ status: "error", message: errorMessage(err) }));
  }, [token, user, dispatch]);

  return (
    <PublicLayout>
      {state.status === "verifying" ? (
        <h1 aria-busy="true">Confirming your email…</h1>
      ) : state.status === "done" ? (
        <>
          <h1>Email confirmed 🎉</h1>
          <p className="publicLead">Thanks! You can always get back into your account now.</p>
          <Link to={user ? "/" : "/login"} className="btn btnPrimary">
            {user ? "Go to your circles" : "Sign in"}
          </Link>
        </>
      ) : (
        <>
          <h1>We couldn't confirm your email</h1>
          <p className="accountError" role="alert">
            {state.message}
          </p>
          <p className="publicNote">{user ? "You can send a new link from Settings." : "Sign in, then send a new link from Settings."}</p>
          <Link to={user ? "/settings" : "/login"} className="btn btnSecondary">
            {user ? "Open Settings" : "Sign in"}
          </Link>
        </>
      )}
    </PublicLayout>
  );
}
