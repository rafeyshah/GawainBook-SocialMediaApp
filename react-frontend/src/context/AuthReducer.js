// `checking` is true until the first GET /auth/me answers, so the app can
// show a loading screen instead of flashing the sign-in page.
export const INITIAL_STATE = { user: null, isFetching: false, error: false, checking: true };

const AuthReducer = (state, action) => {
  switch (action.type) {
    case "LOGIN_START":
      return { user: null, isFetching: true, error: false, checking: false };
    case "LOGIN_SUCCESS":
      return { user: action.payload, isFetching: false, error: false, checking: false };
    case "LOGIN_FAILURE":
      return { user: null, isFetching: false, error: action.payload || "Something went wrong.", checking: false };
    case "CLEAR_ERROR":
      return { ...state, error: false };
    case "LOGOUT":
      return { user: null, isFetching: false, error: false, checking: false };
    // e.g. after changing your profile photo, so the top bar updates at once.
    case "UPDATE_USER":
      if (!state.user) return state;
      return { ...state, user: { ...state.user, ...action.payload } };
    case "FOLLOW":
      if (!state.user) return state;
      return {
        ...state,
        user: { ...state.user, followings: [...(state.user.followings || []), action.payload] },
      };
    case "UNFOLLOW":
      if (!state.user) return state;
      return {
        ...state,
        user: {
          ...state.user,
          followings: (state.user.followings || []).filter((following) => following !== action.payload),
        },
      };
    default:
      return state;
  }
};

export default AuthReducer;
