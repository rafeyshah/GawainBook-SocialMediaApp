import { Link } from "react-router-dom";
import { useContext } from "react";
import { MenuBook, ExitToApp, SettingsOutlined } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import { logoutCall } from "../../apiCalls";
import Avatar from "../avatar/Avatar";
import ThemeSwitcher from "../themeSwitcher/ThemeSwitcher";
import NotificationBell from "../notifications/NotificationBell";
import "./topbar.css";

export default function Topbar() {
  const { user, dispatch } = useContext(AuthContext);
  if (!user) return null;

  return (
    <header className="topbar">
      <div className="topbarInner">
        <Link to="/" className="topbarBrand" aria-label="GawainBook home">
          <span className="topbarMark" aria-hidden="true">
            <MenuBook style={{ fontSize: 18 }} />
          </span>
          <span className="topbarWordmark">GawainBook</span>
        </Link>

        <div className="topbarActions">
          <ThemeSwitcher />
          <NotificationBell />
          <Link to="/settings" className="btn btnGhost topbarSettings" aria-label="Settings">
            <SettingsOutlined style={{ fontSize: 20 }} />
          </Link>
          <Link
            to={`/profile/${user.username}`}
            className="topbarProfile"
            aria-label="Your profile"
          >
            <Avatar user={user} size={30} />
            <span className="topbarUsername">{user.username}</span>
          </Link>
          <button
            type="button"
            className="btn btnGhost topbarLogout"
            onClick={() => logoutCall(dispatch)}
          >
            <ExitToApp style={{ fontSize: 18 }} />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
