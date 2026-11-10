import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { AuthContextProvider } from "./context/AuthContext";
import axios from "axios";
import "./theme.css";

// All API routes live under /api. In development the CRA proxy forwards
// them to the backend; in production the backend serves this app itself.
axios.defaults.baseURL = "/api";

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
