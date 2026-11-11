import AuthReducer, { INITIAL_STATE } from "./AuthReducer";

const user = { _id: "u1", username: "jane", followings: ["a"] };
const signedIn = { user, isFetching: false, error: false, checking: false };

describe("AuthReducer", () => {
  test("starts with no user while the session is being checked", () => {
    expect(INITIAL_STATE).toEqual({ user: null, isFetching: false, error: false, checking: true });
  });

  test("LOGIN_START clears user and error and sets fetching", () => {
    expect(AuthReducer({ ...signedIn, error: "x" }, { type: "LOGIN_START" })).toEqual({
      user: null,
      isFetching: true,
      error: false,
      checking: false,
    });
  });

  test("LOGIN_SUCCESS stores the user and ends the session check", () => {
    expect(AuthReducer(INITIAL_STATE, { type: "LOGIN_SUCCESS", payload: user })).toEqual(signedIn);
  });

  test("LOGIN_FAILURE stores the message, with a fallback", () => {
    expect(AuthReducer(signedIn, { type: "LOGIN_FAILURE", payload: "Nope" }).error).toBe("Nope");
    expect(AuthReducer(signedIn, { type: "LOGIN_FAILURE" }).error).toBe("Something went wrong.");
  });

  test("CLEAR_ERROR keeps everything else", () => {
    expect(AuthReducer({ ...signedIn, error: "x" }, { type: "CLEAR_ERROR" })).toEqual(signedIn);
  });

  test("LOGOUT resets the state and ends the session check", () => {
    expect(AuthReducer(INITIAL_STATE, { type: "LOGOUT" })).toEqual({ user: null, isFetching: false, error: false, checking: false });
  });

  test("FOLLOW and UNFOLLOW update followings without mutating", () => {
    const followed = AuthReducer(signedIn, { type: "FOLLOW", payload: "b" });
    expect(followed.user.followings).toEqual(["a", "b"]);
    expect(user.followings).toEqual(["a"]);
    expect(AuthReducer(followed, { type: "UNFOLLOW", payload: "a" }).user.followings).toEqual(["b"]);
  });

  test("FOLLOW and UNFOLLOW are ignored when signed out (e.g. a late response)", () => {
    const out = { ...INITIAL_STATE, checking: false };
    expect(AuthReducer(out, { type: "FOLLOW", payload: "b" })).toBe(out);
    expect(AuthReducer(out, { type: "UNFOLLOW", payload: "b" })).toBe(out);
  });

  test("handles a user without a followings array", () => {
    const state = { ...signedIn, user: { _id: "u1" } };
    expect(AuthReducer(state, { type: "FOLLOW", payload: "b" }).user.followings).toEqual(["b"]);
  });

  test("UPDATE_USER merges fields into the signed-in user", () => {
    const next = AuthReducer(signedIn, { type: "UPDATE_USER", payload: { profilePicture: "uploads/1.png" } });
    expect(next.user).toEqual({ ...user, profilePicture: "uploads/1.png" });
    expect(user).not.toHaveProperty("profilePicture");
  });

  test("UPDATE_USER is ignored when signed out", () => {
    const out = { ...INITIAL_STATE, checking: false };
    expect(AuthReducer(out, { type: "UPDATE_USER", payload: { profilePicture: "x" } })).toBe(out);
  });

  test("unknown actions return the same state", () => {
    expect(AuthReducer(signedIn, { type: "NOPE" })).toBe(signedIn);
  });
});
