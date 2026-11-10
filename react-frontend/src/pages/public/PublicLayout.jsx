import { Link } from "react-router-dom";
import { MenuBook } from "@material-ui/icons";
import ThemeSwitcher from "../../components/themeSwitcher/ThemeSwitcher";
import "./public.css";

export function LegalLinks() {
  return (
    <nav className="legalLinks" aria-label="Legal">
      <Link to="/waitlist">Waitlist</Link>
      <span aria-hidden="true">·</span>
      <Link to="/privacy">Privacy</Link>
      <span aria-hidden="true">·</span>
      <Link to="/impressum">Impressum</Link>
    </nav>
  );
}

// Shell for public pages (waitlist, privacy, Impressum): same look as sign-in.
export default function PublicLayout({ children, wide = false }) {
  return (
    <div className="public">
      <header className="publicHeader">
        <Link to="/" className="publicBrand" aria-label="GawainBook home">
          <span className="publicMark" aria-hidden="true">
            <MenuBook fontSize="small" />
          </span>
          <span className="publicWordmark">GawainBook</span>
        </Link>
        <ThemeSwitcher />
      </header>
      <main className={`publicCard ${wide ? "wide" : ""}`}>{children}</main>
      <footer className="publicFooter">
        <span>© {new Date().getFullYear()} GawainBook · A social network for readers</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
