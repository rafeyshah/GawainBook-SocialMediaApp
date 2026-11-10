import { createContext, useEffect, useReducer } from "react";
import AuthReducer from "./AuthReducer";

// Read the saved session when the provider mounts (not at import time).
const initialState = () => {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user")) || null;
  } catch {
    user = null;
  }
  return { user, isFetching: false, error: false };
};

export const AuthContext = createContext({ user: null, isFetching: false, error: false });

export const AuthContextProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, undefined, initialState);

  useEffect(() => {
    try {
      if (state.user) localStorage.setItem("user", JSON.stringify(state.user));
      else localStorage.removeItem("user");
    } catch {
      /* storage unavailable: session lasts for this visit only */
    }
  }, [state.user]);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isFetching: state.isFetching,
        error: state.error,
        dispatch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
