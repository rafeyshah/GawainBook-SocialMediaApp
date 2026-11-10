import axios from "axios";

const errorMessage = (err) =>
  err.response?.data?.error ||
  (typeof err.response?.data === "string" ? err.response.data : null) ||
  "Can't reach the server. Please try again.";

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

export const logoutCall = (dispatch) => dispatch({ type: "LOGOUT" });
