import { createContext, useEffect, useReducer } from "react";
import axios from "axios";
import AuthReducer, { INITIAL_STATE } from "./AuthReducer";
import { onUnauthorized } from "../http";

export const AuthContext = createContext({ ...INITIAL_STATE, checking: false });

// The server decides who is signed in (httpOnly session cookie, decision D2).
// On load we ask GET /auth/me; nothing about the user is kept in localStorage.
export const AuthContextProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, INITIAL_STATE);

  useEffect(() => {
    // Older versions stored the user in localStorage; remove that copy.
    try {
      localStorage.removeItem("user");
    } catch {
      /* storage unavailable */
    }

    let cancelled = false;
    axios
      .get("/auth/me")
      .then((res) => !cancelled && dispatch({ type: "LOGIN_SUCCESS", payload: res.data }))
      .catch(() => !cancelled && dispatch({ type: "LOGOUT" }));

    const stop = onUnauthorized(() => dispatch({ type: "LOGOUT" }));
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isFetching: state.isFetching,
        error: state.error,
        checking: state.checking,
        dispatch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
