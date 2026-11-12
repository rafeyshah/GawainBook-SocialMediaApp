import { useContext } from "react";
import { NavLink } from "react-router-dom";
import Topbar from "../topbar/Topbar";
import Sidebar from "../sidebar/Sidebar";
import VerifyBanner from "../verifyBanner/VerifyBanner";
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

// App shell for signed-in pages: a full-width top bar, a sidebar anchored to
// the left edge, and a content area that uses the rest of the screen.
//   width="wide"    overview pages (grids, dashboards) fill the space
//   width="reading" text-heavy pages keep a comfortable line length
//   aside           optional right-hand panel (moves below on narrow screens)
export default function Layout({ children, width = "wide", aside = null }) {
  return (
    <div className="layout">
      <Topbar />
      <MobileNav />
      <div className="layoutBody">
        <Sidebar />
        <div className={`layoutContent ${width} ${aside ? "withAside" : ""}`} data-testid="layout-content">
          <main className="layoutMain">
            <VerifyBanner />
            {children}
          </main>
          {aside && (
            <aside className="layoutAside" aria-label="More for you">
              {aside}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
