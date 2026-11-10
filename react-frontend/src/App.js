import Home from "./pages/home/Home";
import Auth from "./pages/auth/Auth";
import Profile from "./pages/profile/Profile";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
} from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "./context/AuthContext";

function App() {
  const { user } = useContext(AuthContext);
  return (
    <Router>
      <Switch>
        <Route exact path="/">
          {user ? <Home /> : <Redirect to="/login" />}
        </Route>
        <Route path="/login">
          {user ? <Redirect to="/" /> : <Auth mode="login" />}
        </Route>
        <Route path="/register">
          {user ? <Redirect to="/" /> : <Auth mode="register" />}
        </Route>
        <Route path="/profile/:username">
          {user ? <Profile /> : <Redirect to="/login" />}
        </Route>
        <Redirect to="/" />
      </Switch>
    </Router>
  );
}

export default App;
