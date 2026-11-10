import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircularProgress } from "@material-ui/core";
import {
  MenuBook,
  WbSunnyOutlined,
  Brightness2Outlined,
} from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import { loginCall, registerCall } from "../../apiCalls";
import useTheme from "../../useTheme";
import "./auth.css";

const THEMES = [
  { value: "light", label: "Light", Icon: WbSunnyOutlined },
  { value: "dark", label: "Dark", Icon: Brightness2Outlined },
];

function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="authTheme" role="radiogroup" aria-label="Color theme">
      {THEMES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          className={theme === value ? "active" : ""}
          onClick={() => setTheme(value)}
        >
          <Icon style={{ fontSize: 16 }} />
          <span className="srOnly">{label}</span>
        </button>
      ))}
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

        <h1 className="authTitle">
          {isSignup ? "Create your account" : "Sign in to GawainBook"}
        </h1>
        <p className="authSubtitle">
          {isSignup
            ? "Join a community of readers sharing what they love."
            : "Welcome back. Enter your details to continue."}
        </p>

        <form className="authForm" onSubmit={handleSubmit}>
          {isSignup && (
            <div className="authField">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                value={form.username}
                onChange={update}
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="authInput"
              />
            </div>
          )}

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
            {isSignup && (
              <span id="passwordHint" className="authHint">
                At least 6 characters.
              </span>
            )}
          </div>

          {isSignup && (
            <div className="authField">
              <label htmlFor="passwordAgain">Confirm password</label>
              <input
                id="passwordAgain"
                name="passwordAgain"
                type={showPassword ? "text" : "password"}
                value={form.passwordAgain}
                onChange={update}
                required
                minLength={6}
                autoComplete="new-password"
                className="authInput"
              />
            </div>
          )}

          {message && (
            <div className="authError" role="alert">
              {message}
            </div>
          )}

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
          <Link to={isSignup ? "/login" : "/register"}>
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
