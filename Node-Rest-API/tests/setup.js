// Runs before every test file: an isolated in-memory MongoDB per file,
// wiped between tests, and a throwaway uploads folder.
const path = require("path");
const os = require("os");
const fs = require("fs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gawainbook-uploads-"));

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true });
});

afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

// Silence expected server-error logging in test output.
jest.spyOn(console, "error").mockImplementation(() => {});
