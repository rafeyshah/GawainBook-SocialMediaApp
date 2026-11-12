import { useContext, useState } from "react";
import axios from "axios";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import "../../pages/reading/community.css";
import "../../pages/account/account.css";

export function ResendVerification({ compact = false }) {
  const [state, setState] = useState({ status: "idle" });
  const send = async () => {
    setState({ status: "sending" });
    try {
      await axios.post("/auth/resend-verification");
      setState({ status: "sent" });
    } catch (err) {
      setState({ status: "error", message: errorMessage(err) });
    }
  };
  if (state.status === "sent") return <span role="status">Sent! Check your inbox (and spam folder).</span>;
  return (
    <>
      <button type="button" className={compact ? "linkBtn" : "btn btnSecondary"} onClick={send} disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending…" : "Send the link again"}
      </button>
      {state.status === "error" && (
        <span className="accountError" role="alert">
          {state.message}
        </span>
      )}
    </>
  );
}

// Shown on signed-in pages until the email is confirmed.
export default function VerifyBanner() {
  const { user } = useContext(AuthContext);
  const [hidden, setHidden] = useState(false);
  if (!user || user.emailVerified !== false || hidden) return null;
  return (
    <div className="verifyBanner" role="region" aria-label="Confirm your email">
      <span>
        Please confirm <strong>{user.email}</strong>. It's how you get back in if you forget your password.
      </span>
      <span className="itemActions">
        <ResendVerification compact />
        <button type="button" className="linkBtn" onClick={() => setHidden(true)}>
          Later
        </button>
      </span>
    </div>
  );
}

