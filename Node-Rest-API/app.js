const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("./db");
const userRoute = require("./routes/users");
const authRoute = require("./routes/auth");
const postRoute = require("./routes/posts");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "public/images");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const app = express();

app.use(helmet());
if (process.env.NODE_ENV !== "test") app.use(morgan("common"));
app.use(express.json());
app.use("/images", express.static(UPLOAD_DIR));

// Uploads: the server picks the filename (never the client), only images are
// accepted, and size is capped. Responds with { filename } for the post.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${IMAGE_TYPES[file.mimetype]}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  },
});

app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller."
          : "Please upload a PNG, JPG, GIF or WebP image.";
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "No image was uploaded." });
    return res.status(201).json({ filename: req.file.filename });
  });
});

app.get("/api/health", (req, res) => {
  const s = db.status();
  res.status(s.db === "connected" ? 200 : 503).json(s);
});

app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/posts", postRoute);

// Unknown API routes get JSON, not the React app.
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// In production, serve the built React app from the same server.
const clientBuild = path.join(__dirname, "../react-frontend/build");
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get("*", (req, res) => res.sendFile(path.join(clientBuild, "index.html")));
}

module.exports = app;
