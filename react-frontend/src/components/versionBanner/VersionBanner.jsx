import { useEffect, useState } from "react";
import axios from "axios";
import "./versionBanner.css";

// Must match API_VERSION in Node-Rest-API/src/version.ts.
export const EXPECTED_API_VERSION = 9;

// A server older than this frontend (e.g. a local API that wasn't restarted,
// or a deploy that's half done) makes pages fail in confusing ways. Detect it
// once on load and say so plainly.
export default function VersionBanner({ dev = process.env.NODE_ENV === "development" }) {
  const [serverVersion, setServerVersion] = useState(null); // null = unknown/ok

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/health")
      .then((res) => {
        if (cancelled) return;
        const v = Number(res.data?.apiVersion) || 0;
        if (v < EXPECTED_API_VERSION) setServerVersion(v);
      })
      .catch((err) => {
        // A health response without a version (or 404) means a very old server.
        if (!cancelled && err?.response && !err.response.data?.apiVersion && err.response.status !== 503) setServerVersion(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (serverVersion === null) return null;
  return (
    <div className="versionBanner" role="alert">
      {dev ? (
        <>
          <strong>The API server is out of date</strong> (version {serverVersion || "unknown"}, this app needs{" "}
          {EXPECTED_API_VERSION}). Stop it and run <code>npm start</code> in <code>Node-Rest-API</code> (after{" "}
          <code>npm run build</code>), then refresh. Until then some pages show “not found” and posting fails.
        </>
      ) : (
        <>
          <strong>GawainBook is being updated.</strong> Some features may not work for a minute. Please refresh shortly.
        </>
      )}
    </div>
  );
}
