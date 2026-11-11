import { useContext, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { LocationOnOutlined, PublicOutlined, EventOutlined } from "@material-ui/icons";
import Layout from "../../components/layout/Layout";
import Feed from "../../components/feed/Feed";
import Avatar from "../../components/avatar/Avatar";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import BookCover from "../../components/book/BookCover";
import "../reading/reading.css";
import "./profile.css";

const PF = process.env.REACT_APP_PUBLIC_FOLDER || "/images/";

export const joinedLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Joined ${d.toLocaleString("en-US", { month: "long", year: "numeric" })}`;
};

function FollowButton({ profile, onChange }) {
  const { user: me, dispatch } = useContext(AuthContext);
  const following = (me.followings || []).includes(profile._id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      await axios.put(`/users/${profile._id}/${following ? "unfollow" : "follow"}`);
      dispatch({ type: following ? "UNFOLLOW" : "FOLLOW", payload: profile._id });
      onChange(following ? -1 : 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profileFollow">
      <button
        type="button"
        className={`btn ${following ? "btnSecondary" : "btnPrimary"}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
      >
        {busy ? "…" : following ? "Following" : "Follow"}
      </button>
      {error && (
        <span className="profileFollowError" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// The books a reader is reading and has finished. For other readers the API
// never returns how far they are, so this only shows covers.
export function ProfileShelves({ username, isMe }) {
  const [shelves, setShelves] = useState(null);
  useEffect(() => {
    let cancelled = false;
    axios
      .get(`/shelves?username=${encodeURIComponent(username)}`)
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        // Tolerate missing keys rather than crashing the profile.
        setShelves({ reading: d.reading || [], want: d.want || [], finished: d.finished || [] });
      })
      .catch(() => !cancelled && setShelves({ reading: [], want: [], finished: [] }));
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!shelves) return null;
  const groups = [
    ["reading", "Reading now"],
    ["finished", "Finished"],
  ].filter(([key]) => shelves[key].length > 0);
  if (!groups.length) {
    return isMe ? (
      <section className="card emptyCard">
        <strong>Your bookshelf is empty</strong>
        Add books from the <Link to="/library">library</Link>.
      </section>
    ) : null;
  }
  return (
    <section className="card cardPad" aria-label="Bookshelf">
      {groups.map(([key, label]) => (
        <div key={key} className="section" style={{ marginBottom: 12 }}>
          <h2 className="sectionTitle">{label}</h2>
          <div className="shelfStrip">
            {shelves[key].map((b) => (
              <Link key={b._id} to={`/books/${b.slug}`} title={`${b.title} by ${b.author}`}>
                <BookCover book={b} size="sm" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { user: me } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | notfound | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    axios
      .get(`/users?username=${encodeURIComponent(username)}`)
      .then((res) => {
        if (cancelled) return;
        setProfile(res.data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(errorMessage(err));
        setStatus(err.response?.status === 404 ? "notfound" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const isMe = profile && profile._id === me._id;
  const adjustFollowers = (delta) =>
    setProfile((p) => ({
      ...p,
      followers:
        delta > 0 ? [...p.followers, me._id] : p.followers.filter((id) => id !== me._id),
    }));

  let content;
  if (status === "loading") {
    content = <div className="profileHeader card profileSkeleton" aria-busy="true" aria-label="Loading profile" />;
  } else if (status !== "ready") {
    content = (
      <div className="profileState card" role={status === "error" ? "alert" : undefined}>
        <h1>{status === "notfound" ? "Reader not found" : "Couldn't load this profile"}</h1>
        <p>{status === "notfound" ? `There's no reader called “${username}”.` : message}</p>
        <Link to="/" className="btn btnSecondary">
          Back to home
        </Link>
      </div>
    );
  } else {
    const details = [
      profile.city && { icon: LocationOnOutlined, text: profile.city },
      profile.from && { icon: PublicOutlined, text: `From ${profile.from}` },
      joinedLabel(profile.createdAt) && { icon: EventOutlined, text: joinedLabel(profile.createdAt) },
    ].filter(Boolean);

    content = (
      <>
        <section className="profileHeader card" aria-label={`${profile.username}'s profile`}>
          <div
            className="profileCover"
            style={profile.coverPicture ? { backgroundImage: `url(${PF + profile.coverPicture})` } : undefined}
          />
          <div className="profileBody">
            <div className="profileTopRow">
              <div className="profileAvatar">
                <Avatar user={profile} size={88} />
              </div>
              {!isMe && <FollowButton profile={profile} onChange={adjustFollowers} />}
            </div>
            <h1 className="profileName">{profile.username}</h1>
            {profile.desc && <p className="profileDesc">{profile.desc}</p>}
            {details.length > 0 && (
              <ul className="profileDetails">
                {details.map(({ icon: Icon, text }) => (
                  <li key={text}>
                    <Icon style={{ fontSize: 16 }} />
                    {text}
                  </li>
                ))}
              </ul>
            )}
            <div className="profileStats">
              <span>
                <strong>{profile.followers.length}</strong>{" "}
                {profile.followers.length === 1 ? "follower" : "followers"}
              </span>
              <span>
                <strong>{profile.followings.length}</strong> following
              </span>
            </div>
          </div>
        </section>
        <Feed username={profile.username} />
      </>
    );
  }

  return (
    <Layout
      width="reading"
      aside={status === "ready" ? <ProfileShelves username={profile.username} isMe={isMe} /> : null}
    >
      {content}
    </Layout>
  );
}
