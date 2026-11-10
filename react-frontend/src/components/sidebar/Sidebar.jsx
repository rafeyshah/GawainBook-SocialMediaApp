import { useContext, useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import axios from "axios";
import { PeopleOutline, LocalLibraryOutlined, DynamicFeed, PersonOutline } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import Avatar from "../avatar/Avatar";
import "./sidebar.css";

// Navigation plus the real list of readers you follow.
export default function Sidebar() {
  const { user } = useContext(AuthContext);
  const [following, setFollowing] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);
  const followingKey = (user.followings || []).join(",");

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    axios
      .get(`/users/friends/${user._id}`)
      .then((res) => !cancelled && setFollowing(Array.isArray(res.data) ? res.data : []))
      .catch(() => {
        if (!cancelled) {
          setFollowing([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user._id, followingKey]);

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <nav className="sidebarNav" aria-label="Main">
        <NavLink
          exact
          to="/"
          className="sidebarLink"
          activeClassName="active"
          isActive={(match, location) => Boolean(match) || /^\/(circles|threads)\//.test(location.pathname)}
        >
          <PeopleOutline style={{ fontSize: 20 }} />
          Circles
        </NavLink>
        <NavLink
          to="/library"
          className="sidebarLink"
          activeClassName="active"
          isActive={(match, location) => Boolean(match) || location.pathname.startsWith("/books/")}
        >
          <LocalLibraryOutlined style={{ fontSize: 20 }} />
          Library
        </NavLink>
        <NavLink to="/feed" className="sidebarLink" activeClassName="active">
          <DynamicFeed style={{ fontSize: 20 }} />
          Feed
        </NavLink>
        <NavLink to={`/profile/${user.username}`} className="sidebarLink" activeClassName="active">
          <PersonOutline style={{ fontSize: 20 }} />
          Profile
        </NavLink>
      </nav>

      <section className="sidebarSection">
        <h2 className="sidebarHeading">Following</h2>
        {following === null ? (
          <ul className="sidebarList" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <li key={i} className="sidebarSkeleton" />
            ))}
          </ul>
        ) : failed ? (
          <p className="sidebarEmpty">Couldn't load who you follow.</p>
        ) : following.length === 0 ? (
          <p className="sidebarEmpty">
            You're not following anyone yet. Visit a reader's profile to follow them.
          </p>
        ) : (
          <ul className="sidebarList">
            {following.map((f) => (
              <li key={f._id}>
                <Link to={`/profile/${f.username}`} className="sidebarPerson">
                  <Avatar user={f} size={28} />
                  <span>{f.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
