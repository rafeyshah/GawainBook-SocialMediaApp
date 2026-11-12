// Bump when the API changes in a way the frontend depends on. The React app
// checks this on load (GET /api/health) and warns if the server is older,
// instead of failing with confusing "not found" pages.
//   1 = MongoDB era · 2 = Postgres + sessions · 3 = books, shelves, circles
export const API_VERSION = 5;
