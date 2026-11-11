import { useEffect, useState } from "react";
import { Link, useHistory, useParams } from "react-router-dom";
import axios from "axios";
import { PeopleOutline, LockOutlined } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import BookCover from "../../components/book/BookCover";
import { errorMessage } from "../../apiCalls";
import { plural } from "./CirclesHome";
import "../reading/reading.css";
import "../reading/community.css";

// Where an invite link (/join/:code) lands: who's inviting you to what,
// then one button to join.
export default function JoinPage() {
  const { code } = useParams();
  const history = useHistory();
  const [state, setState] = useState({ status: "loading" });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    axios
      .get(`/invitations/${encodeURIComponent(code)}`)
      .then((res) => live && setState({ status: "ready", ...res.data }))
      .catch((err) => {
        if (!live) return;
        const s = err.response?.status;
        setState({ status: s === 410 ? "dead" : s === 404 ? "invalid" : "error", message: errorMessage(err) });
      });
    return () => {
      live = false;
    };
  }, [code]);

  const join = async () => {
    setJoining(true);
    setError("");
    try {
      const res = await axios.post("/circles/join", { code });
      history.push(`/circles/${res.data.circleId}`);
    } catch (err) {
      setError(errorMessage(err));
      setJoining(false);
    }
  };

  let content;
  if (state.status === "loading") {
    content = <div className="skeleton" style={{ height: 260 }} aria-busy="true" aria-label="Loading invitation" />;
  } else if (state.status !== "ready") {
    const title = { dead: "This invite link no longer works", invalid: "Invite link not found", error: "Couldn't open this invitation" }[state.status];
    content = (
      <div className="card lockedPanel" role={state.status === "error" ? "alert" : undefined}>
        <h1>{title}</h1>
        <p>{state.status === "invalid" ? "Check the link, or ask the organiser for a new one." : state.message}</p>
        <Link to="/" className="btn btnSecondary">
          Back to your circles
        </Link>
      </div>
    );
  } else {
    const { circle } = state;
    content = (
      <section className="card joinCard" aria-label={`Invitation to ${circle.name}`}>
        <BookCover book={circle.book} size="md" />
        <p className="pageSubtitle" style={{ margin: 0 }}>
          You're invited to join
        </p>
        <h1 className="pageTitle" style={{ margin: 0 }}>
          {circle.name}
        </h1>
        <span className="rowCardMeta">
          Reading {circle.book.title} by {circle.book.author}
        </span>
        {circle.description && <p className="bookHeroText">{circle.description}</p>}
        <div className="badges" style={{ justifyContent: "center" }}>
          {circle.visibility === "private" && (
            <span className="badge private">
              <LockOutlined style={{ fontSize: 13 }} /> Private
            </span>
          )}
          <span className="badge">
            <PeopleOutline style={{ fontSize: 14 }} /> {plural(circle.memberCount, "member")}
          </span>
        </div>
        {state.alreadyMember ? (
          <Link to={`/circles/${circle._id}`} className="btn btnPrimary">
            You're already in this circle. Open it
          </Link>
        ) : (
          <button type="button" className="btn btnPrimary" onClick={join} disabled={joining}>
            {joining ? "Joining…" : "Join the circle"}
          </button>
        )}
        <p className="sourceNote">Discussions stay locked until you reach their chapter, so you can join at any point in the book.</p>
        {error && (
          <div className="errorBox" role="alert">
            {error}
          </div>
        )}
      </section>
    );
  }

  return <Layout width="reading">{content}</Layout>;
}
