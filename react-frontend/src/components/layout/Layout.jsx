import { useContext } from "react";
import { NavLink } from "react-router-dom";
import Topbar from "../topbar/Topbar";
import Sidebar from "../sidebar/Sidebar";
import { AuthContext } from "../../context/AuthContext";
import "./layout.css";

// On small screens the sidebar is hidden, so the main sections move into a
// tab bar under the top bar.
function MobileNav() {
  const { user } = useContext(AuthContext);
  return (
    <nav className="mobileNav" aria-label="Sections">
      <NavLink exact to="/" activeClassName="active" isActive={(m, l) => Boolean(m) || /^\/(circles|threads)\//.test(l.pathname)}>
        Circles
      </NavLink>
      <NavLink to="/library" activeClassName="active" isActive={(m, l) => Boolean(m) || l.pathname.startsWith("/books/")}>
        Library
      </NavLink>
      <NavLink to="/feed" activeClassName="active">
        Feed
      </NavLink>
      <NavLink to={`/profile/${user.username}`} activeClassName="active">
        Profile
      </NavLink>
    </nav>
  );
}

// Shared shell for signed-in pages: top bar, sidebar and main column.
export default function Layout({ children }) {
  return (
    <div className="layout">
      <Topbar />
      <MobileNav />
      <div className="layoutBody">
        <Sidebar />
        <main className="layoutMain">{children}</main>
      </div>
    </div>
  );
}
