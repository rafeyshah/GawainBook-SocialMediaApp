import axios from "axios";

// Turn an axios error into a short, human-readable message. Never show raw
// HTML (e.g. an Express/proxy error page) to the user.
export const errorMessage = (err) => {
  const data = err?.response?.data;
  if (data && typeof data.error === "string") return data.error;
  if (typeof data === "string" && data.length < 200 && !data.trim().startsWith("<")) {
    return data;
  }
  if (!err?.response) return "Can't reach the server. Please try again.";
  if (err.response.status === 404) return "We couldn't find that. Please try again later.";
  return "Something went wrong. Please try again.";
};

export const loginCall = async (userCredential, dispatch) => {
  dispatch({ type: "LOGIN_START" });
  try {
    const res = await axios.post("/auth/login", userCredential);
    dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
  } catch (err) {
    dispatch({ type: "LOGIN_FAILURE", payload: errorMessage(err) });
  }
};

// Creates the account, then signs the new user straight in.
export const registerCall = async (newUser, dispatch) => {
  dispatch({ type: "LOGIN_START" });
  try {
    const res = await axios.post("/auth/register", newUser);
    dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
  } catch (err) {
    dispatch({ type: "LOGIN_FAILURE", payload: errorMessage(err) });
  }
};

// Ends the session on the server, then signs out locally even if the
// request fails (e.g. offline): the user asked to leave.
export const logoutCall = async (dispatch) => {
  try {
    await axios.post("/auth/logout");
  } catch {
    /* ignore */
  }
  dispatch({ type: "LOGOUT" });
};
