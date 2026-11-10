// Test fixtures for the reading pages (circles, books, library).
export const BOOK = {
  _id: "b1",
  slug: "pride-and-prejudice",
  title: "Pride and Prejudice",
  author: "Jane Austen",
  coverColor: "#7a3e48",
  chapterCount: 61,
};

export const OZ = { _id: "b2", slug: "oz", title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", coverColor: "#2f7553", chapterCount: 24 };

export const circleCard = (over = {}) => ({
  _id: "c1",
  name: "The Netherfield Circle",
  description: "A friendly first read.",
  visibility: "public",
  schedule: "5 chapters a week",
  book: BOOK,
  memberCount: 6,
  myRole: "member",
  myProgress: 12,
  openThreads: 4,
  lockedThreads: 2,
  lastActivity: null,
  ...over,
});

export const circleDetail = (over = {}) => ({
  ...circleCard(),
  ownerId: "u9",
  members: [
    { _id: "u1", username: "jane", profilePicture: "", role: "member", chapter: 12 },
    { _id: "u9", username: "elinor", profilePicture: "", role: "owner", chapter: 15 },
    { _id: "u8", username: "darcy", profilePicture: "", role: "moderator", chapter: 61 },
  ],
  ...over,
});

export const THREADS = [
  { _id: "t1", chapterSeq: 1, title: "That opening line", locked: false, createdAt: new Date().toISOString(), commentCount: 2, author: { _id: "u9", username: "elinor" } },
  { _id: "t9", chapterSeq: 34, locked: true },
];

export const threadDetail = (over = {}) => ({
  _id: "t1",
  title: "That opening line",
  body: "What did you think?",
  chapterSeq: 1,
  chapterTitle: "Chapter 1",
  createdAt: new Date().toISOString(),
  author: { _id: "u9", username: "elinor", profilePicture: "" },
  circle: { _id: "c1", name: "The Netherfield Circle" },
  comments: [
    { _id: "m1", body: "Loved it", createdAt: new Date().toISOString(), author: { _id: "u9", username: "elinor", profilePicture: "" } },
    { _id: "m2", body: "Me too", createdAt: new Date().toISOString(), author: { _id: "u1", username: "jane", profilePicture: "" } },
  ],
  canReply: true,
  canModerate: false,
  ...over,
});

// Answers axios.get by URL (exact match first, then prefix), so the page and
// the sidebar each get their own data. Unknown URLs get an empty list.
export const routeGet = (axios, routes) => {
  axios.get.mockImplementation((url) => {
    const key = url in routes ? url : Object.keys(routes).find((k) => url.startsWith(k));
    const value = key === undefined ? [] : routes[key];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value });
  });
};
