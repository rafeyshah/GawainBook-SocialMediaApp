import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { AuthContextProvider } from "./context/AuthContext";
import { setupHttp } from "./http";
import "./theme.css";

// All API routes live under /api (the CRA proxy forwards them in development;
// in production the backend serves this app). Also adds the CSRF header.
setupHttp();

// Apply the saved colour theme before the first render to avoid a flash.
try {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }
} catch {
  /* storage unavailable: follow the system setting */
}

ReactDOM.render(
  <React.StrictMode>
    <AuthContextProvider>
      <App />
    </AuthContextProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
