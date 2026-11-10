import { useEffect, useState } from "react";
import axios from "axios";

// Loads who runs the site and whether the waitlist is open (GET /api/legal).
// status: "loading" | "ready" | "error"
export default function useLegal() {
  const [state, setState] = useState({ status: "loading", operator: null, waitlistOpen: false, privacyVersion: "" });

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/legal")
      .then((res) => !cancelled && setState({ status: "ready", ...res.data }))
      .catch(() => !cancelled && setState((s) => ({ ...s, status: "error" })));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
