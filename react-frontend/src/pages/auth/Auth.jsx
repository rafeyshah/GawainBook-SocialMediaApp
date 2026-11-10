import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircularProgress } from "@material-ui/core";
import { AuthContext } from "../../context/AuthContext";
import { loginCall, registerCall } from "../../apiCalls";
import "./auth.css";

const EMPTY = { username: "", email: "", password: "", passwordAgain: "" };

// One page for both "Sign in" and "Create account"; the URL decides the mode.
export default function Auth({ mode }) {
  const isSignup = mode === "register";
  const { isFetching, error, dispatch } = useContext(AuthContext);
  const [form, setForm] = useState(EMPTY);
  const [localError, setLocalError] = useState("");

  // Clear messages and passwords when switching between the two modes.
  useEffect(() => {
    setLocalError("");
    setForm((f) => ({ ...f, password: "", passwordAgain: "" }));
    dispatch({ type: "CLEAR_ERROR" });
  }, [mode, dispatch]);

  const update = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (localError) setLocalError("");
    if (error) dispatch({ type: "CLEAR_ERROR" });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSignup) {
      if (form.password !== form.passwordAgain) {
        setLocalError("Passwords don't match.");
        return;
      }
      registerCall(
        { username: form.username.trim(), email: form.email.trim(), password: form.password },
        dispatch
      );
    } else {
      loginCall({ email: form.email.trim(), password: form.password }, dispatch);
    }
  };

  const message = localError || (typeof error === "string" ? error : "");

  return (
    <div className="auth">
      <div className="authWrapper">
        <div className="authIntro">
          <h1 className="authLogo">GawainBook</h1>
          <p className="authDesc">
            Connect with friends and the world around you on GawainBook.
          </p>
        </div>

        <div className="authCard">
          <div className="authTabs" role="tablist">
            <Link
              to="/login"
              role="tab"
              aria-selected={!isSignup}
              className={`authTab ${!isSignup ? "active" : ""}`}
            >
              Sign in
            </Link>
            <Link
              to="/register"
              role="tab"
              aria-selected={isSignup}
              className={`authTab ${isSignup ? "active" : ""}`}
            >
              Create account
            </Link>
          </div>

          <form className="authForm" onSubmit={handleSubmit}>
            {isSignup && (
              <label className="authField">
                <span>Username</span>
                <input
                  name="username"
                  value={form.username}
                  onChange={update}
                  required
                  minLength={3}
                  maxLength={20}
                  autoComplete="username"
                  className="authInput"
                />
              </label>
            )}

            <label className="authField">
              <span>Email</span>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={update}
                required
                autoComplete="email"
                className="authInput"
              />
            </label>

            <label className="authField">
              <span>Password</span>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={update}
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="authInput"
              />
            </label>

            {isSignup && (
              <label className="authField">
                <span>Confirm password</span>
                <input
                  name="passwordAgain"
                  type="password"
                  value={form.passwordAgain}
                  onChange={update}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="authInput"
                />
              </label>
            )}

            {message && (
              <div className="authError" role="alert">
                {message}
              </div>
            )}

            <button className="authSubmit" type="submit" disabled={isFetching}>
              {isFetching ? (
                <CircularProgress color="inherit" size={20} />
              ) : isSignup ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="authSwitch">
            {isSignup ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                New to GawainBook? <Link to="/register">Create an account</Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
