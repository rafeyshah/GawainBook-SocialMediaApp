import AuthReducer from "./AuthReducer";

const user = { _id: "u1", username: "jane", followings: ["a"] };
const signedIn = { user, isFetching: false, error: false };

describe("AuthReducer", () => {
  test("LOGIN_START clears user and error and sets fetching", () => {
    expect(AuthReducer({ ...signedIn, error: "x" }, { type: "LOGIN_START" })).toEqual({
      user: null,
      isFetching: true,
      error: false,
    });
  });

  test("LOGIN_SUCCESS stores the user", () => {
    expect(AuthReducer({ user: null, isFetching: true, error: false }, { type: "LOGIN_SUCCESS", payload: user })).toEqual(
      signedIn
    );
  });

  test("LOGIN_FAILURE stores the message, with a fallback", () => {
    expect(AuthReducer(signedIn, { type: "LOGIN_FAILURE", payload: "Nope" }).error).toBe("Nope");
    expect(AuthReducer(signedIn, { type: "LOGIN_FAILURE" }).error).toBe("Something went wrong.");
  });

  test("CLEAR_ERROR keeps everything else", () => {
    expect(AuthReducer({ ...signedIn, error: "x" }, { type: "CLEAR_ERROR" })).toEqual(signedIn);
  });

  test("LOGOUT resets the state", () => {
    expect(AuthReducer(signedIn, { type: "LOGOUT" })).toEqual({ user: null, isFetching: false, error: false });
  });

  test("FOLLOW and UNFOLLOW update followings without mutating", () => {
    const followed = AuthReducer(signedIn, { type: "FOLLOW", payload: "b" });
    expect(followed.user.followings).toEqual(["a", "b"]);
    expect(user.followings).toEqual(["a"]);
    expect(AuthReducer(followed, { type: "UNFOLLOW", payload: "a" }).user.followings).toEqual(["b"]);
  });

  test("unknown actions return the same state", () => {
    expect(AuthReducer(signedIn, { type: "NOPE" })).toBe(signedIn);
  });
});
