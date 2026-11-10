const request = require("supertest");
const app = require("../app");

let counter = 0;

// Registers a user through the real API and returns the response body.
async function createUser(overrides = {}) {
  counter += 1;
  const body = {
    username: `reader${counter}`,
    email: `reader${counter}@example.com`,
    password: "secret123",
    ...overrides,
  };
  const res = await request(app).post("/api/auth/register").send(body);
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createPost(userId, overrides = {}) {
  const res = await request(app)
    .post("/api/posts")
    .send({ userId, desc: "A great read", ...overrides });
  if (res.status !== 201) throw new Error(`createPost failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const NONEXISTENT_ID = "64b000000000000000000000";

module.exports = { app, request, createUser, createPost, NONEXISTENT_ID };
