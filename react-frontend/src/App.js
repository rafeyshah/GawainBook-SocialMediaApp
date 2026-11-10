import Home from "./pages/home/Home";
import CirclesHome from "./pages/circles/CirclesHome";
import CirclePage from "./pages/circles/CirclePage";
import ThreadPage from "./pages/circles/ThreadPage";
import BookPage from "./pages/books/BookPage";
import Library from "./pages/books/Library";
import Auth from "./pages/auth/Auth";
import Profile from "./pages/profile/Profile";
import Waitlist from "./pages/public/Waitlist";
import { Impressum, Privacy } from "./pages/public/Legal";
import { BrowserRouter as Router, Switch, Route, Redirect } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "./context/AuthContext";

// Shown briefly while GET /auth/me says whether a session exists.
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading GawainBook">
      <span className="splashMark" aria-hidden="true" />
    </div>
  );
}

function App() {
  const { user, checking } = useContext(AuthContext);
  // Signed-in pages and guest-only pages wait for the session check;
  // public pages (waitlist, privacy, Impressum) render straight away.
  const signedIn = (page) => (checking ? <Splash /> : user ? page : <Redirect to="/login" />);
  const guestOnly = (page) => (checking ? <Splash /> : user ? <Redirect to="/" /> : page);

  return (
    <Router>
      <Switch>
        <Route path="/waitlist">
          <Waitlist />
        </Route>
        <Route path="/privacy">
          <Privacy />
        </Route>
        <Route path="/impressum">
          <Impressum />
        </Route>
        <Route exact path="/">
          {signedIn(<CirclesHome />)}
        </Route>
        <Route path="/circles/:id">{signedIn(<CirclePage />)}</Route>
        <Route path="/threads/:id">{signedIn(<ThreadPage />)}</Route>
        <Route path="/books/:slug">{signedIn(<BookPage />)}</Route>
        <Route path="/library">{signedIn(<Library />)}</Route>
        <Route path="/feed">{signedIn(<Home />)}</Route>
        <Route path="/login">{guestOnly(<Auth mode="login" />)}</Route>
        <Route path="/register">{guestOnly(<Auth mode="register" />)}</Route>
        <Route path="/profile/:username">{signedIn(<Profile />)}</Route>
        <Redirect to="/" />
      </Switch>
    </Router>
  );
}

export default App;
