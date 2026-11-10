import { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircularProgress } from "@material-ui/core";
import { MenuBook } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import { loginCall, registerCall } from "../../apiCalls";
import ThemeSwitcher from "../../components/themeSwitcher/ThemeSwitcher";
import "./auth.css";

// Smoothly expands/collapses its content (height + opacity) instead of
// popping it in and out. Hidden content is inert so it can't be focused.
function Collapse({ open, children }) {
  const last = useRef(children);
  if (open) last.current = children;
  return (
    <div className={`authCollapse ${open ? "open" : ""}`} aria-hidden={!open} inert={open ? undefined : ""}>
      <div className="authCollapseInner">{open ? children : last.current}</div>
    </div>
  );
}

const EMPTY = { username: "", email: "", password: "", passwordAgain: "" };

// One page for both "Sign in" and "Create account"; the URL decides the mode.
export default function Auth({ mode }) {
  const isSignup = mode === "register";
  const { isFetching, error, dispatch } = useContext(AuthContext);
  const [form, setForm] = useState(EMPTY);
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Clear messages and passwords when switching between the two modes.
  useEffect(() => {
    setLocalError("");
    setShowPassword(false);
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
      <header className="authHeader">
        <div className="authBrand">
          <span className="authMark" aria-hidden="true">
            <MenuBook fontSize="small" />
          </span>
          <span className="authWordmark">GawainBook</span>
        </div>
        <ThemeSwitcher />
      </header>

      <main className="authCard">
        <div className="authHeading" key={mode}>
          <h1 className="authTitle">
            {isSignup ? "Create your account" : "Sign in to GawainBook"}
          </h1>
          <p className="authSubtitle">
            {isSignup
              ? "Join a community of readers who love to share."
              : "Welcome back. Enter your details to continue."}
          </p>
        </div>

        <form className="authForm" onSubmit={handleSubmit}>
          <Collapse open={isSignup}>
            <div className="authField">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                value={form.username}
                onChange={update}
                required
                disabled={!isSignup}
                minLength={3}
                maxLength={20}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="authInput"
              />
            </div>
          </Collapse>

          <div className="authField">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={update}
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="authInput"
            />
          </div>

          <div className="authField">
            <div className="authLabelRow">
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="authTextButton"
                onClick={() => setShowPassword((v) => !v)}
                aria-controls="password"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={update}
              required
              minLength={6}
              autoComplete={isSignup ? "new-password" : "current-password"}
              aria-describedby={isSignup ? "passwordHint" : undefined}
              className="authInput"
            />
            <Collapse open={isSignup}>
              <span id="passwordHint" className="authHint">
                At least 6 characters.
              </span>
            </Collapse>
          </div>

          <Collapse open={isSignup}>
            <div className="authField">
              <label htmlFor="passwordAgain">Confirm password</label>
              <input
                id="passwordAgain"
                name="passwordAgain"
                type={showPassword ? "text" : "password"}
                value={form.passwordAgain}
                onChange={update}
                required
                disabled={!isSignup}
                minLength={6}
                autoComplete="new-password"
                className="authInput"
              />
            </div>
          </Collapse>

          <Collapse open={Boolean(message)}>
            <div className="authError" role="alert">
              {message}
            </div>
          </Collapse>

          <button className="authSubmit" type="submit" disabled={isFetching}>
            {isFetching ? (
              <CircularProgress color="inherit" size={18} />
            ) : isSignup ? (
              "Create account"
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="authSwitch">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <Link to={isSignup ? "/login" : "/register"} replace>
            {isSignup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </main>

      <footer className="authFooter">
        © {new Date().getFullYear()} GawainBook · A social network for readers
      </footer>
    </div>
  );
}
