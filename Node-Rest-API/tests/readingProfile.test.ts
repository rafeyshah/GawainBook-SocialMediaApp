import { cleanGenres, MAX_GENRES } from "../src/routes/users";
import { HttpError } from "../src/http";
import { signUp } from "./helpers";

describe("cleanGenres", () => {
  test("trims, collapses spaces, drops blanks and case-insensitive duplicates, keeps order", () => {
    expect(cleanGenres(["  Romantasy ", "cosy   mystery", "", "ROMANTASY", "Fantasy"])).toEqual(["Romantasy", "cosy mystery", "Fantasy"]);
  });
  test("allows exactly the maximum", () => {
    expect(cleanGenres(Array.from({ length: MAX_GENRES }, (_, i) => `g${i}`))).toHaveLength(MAX_GENRES);
  });
  test("duplicates don't count towards the maximum", () => {
    expect(cleanGenres([...Array.from({ length: MAX_GENRES }, (_, i) => `g${i}`), "G0", "g1"])).toHaveLength(MAX_GENRES);
  });
  test.each([
    ["not a list", "Fantasy", /must be a list/],
    ["a non-text item", ["Fantasy", 3], /must be text/],
    ["a long genre", ["x".repeat(31)], /30 characters/],
    ["too many", Array.from({ length: MAX_GENRES + 1 }, (_, i) => `g${i}`), /up to 8/],
  ])("rejects %s", (_n, value, message) => {
    expect(() => cleanGenres(value)).toThrow(HttpError);
    expect(() => cleanGenres(value)).toThrow(message);
  });
});

describe("reading profile (genres, language, pace)", () => {
  test("new accounts start with an empty reading profile; nothing is required", async () => {
    const { user } = await signUp();
    expect(user).toMatchObject({ favoriteGenres: [], readingLanguage: null, pace: null });
  });

  test("you can set, change and clear each field; others see them on your profile", async () => {
    const me = await signUp();
    const res = await me.client.put(`/api/users/${me.user._id}`, { favoriteGenres: ["Romance", " Fantasy "], readingLanguage: "de", pace: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ favoriteGenres: ["Romance", "Fantasy"], readingLanguage: "de", pace: 5 });

    const other = await signUp();
    const seen = (await other.client.get("/api/users", { username: me.user.username })).body;
    expect(seen).toMatchObject({ favoriteGenres: ["Romance", "Fantasy"], readingLanguage: "de", pace: 5 });

    const cleared = await me.client.put(`/api/users/${me.user._id}`, { favoriteGenres: null, readingLanguage: "", pace: null });
    expect(cleared.body).toMatchObject({ favoriteGenres: [], readingLanguage: null, pace: null });
  });

  test("updating one field leaves the others alone", async () => {
    const me = await signUp();
    await me.client.put(`/api/users/${me.user._id}`, { favoriteGenres: ["Horror"], pace: 3 });
    const res = await me.client.put(`/api/users/${me.user._id}`, { readingLanguage: "en" });
    expect(res.body).toMatchObject({ favoriteGenres: ["Horror"], pace: 3, readingLanguage: "en" });
  });

  test.each([
    ["an unknown language", { readingLanguage: "xx" }],
    ["a language name instead of a code", { readingLanguage: "English" }],
    ["pace 0", { pace: 0 }],
    ["pace 101", { pace: 101 }],
    ["fractional pace", { pace: 2.5 }],
    ["pace as text", { pace: "5" }],
    ["genres as a string", { favoriteGenres: "Fantasy" }],
    ["nine genres", { favoriteGenres: Array.from({ length: 9 }, (_, i) => `g${i}`) }],
  ])("rejects %s and changes nothing", async (_n, body) => {
    const me = await signUp();
    await me.client.put(`/api/users/${me.user._id}`, { pace: 4 });
    expect((await me.client.put(`/api/users/${me.user._id}`, body)).status).toBe(400);
    expect((await me.client.get("/api/auth/me")).body.pace).toBe(4);
  });

  test("you can't change someone else's reading profile", async () => {
    const me = await signUp();
    const other = await signUp();
    expect((await me.client.put(`/api/users/${other.user._id}`, { pace: 9 })).status).toBe(403);
  });
});
