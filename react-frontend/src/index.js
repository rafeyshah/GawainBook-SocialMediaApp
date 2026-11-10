import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { AuthContextProvider } from "./context/AuthContext";
import axios from "axios";

// All API routes live under /api. In development the CRA proxy forwards
// them to the backend; in production the backend serves this app itself.
axios.defaults.baseURL = "/api";

ReactDOM.render(
  <React.StrictMode>
    <AuthContextProvider>
      <App />
    </AuthContextProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
