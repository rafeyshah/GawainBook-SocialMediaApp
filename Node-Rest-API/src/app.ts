import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { dbStatus } from "./db/client";
import { errorHandler, handle } from "./http";
import { createStorage, Storage } from "./storage";
import authRoute from "./routes/auth";
import userRoute from "./routes/users";
import postRoute from "./routes/posts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
// Keys the /images route will look up in storage.
export const UPLOAD_KEY = /^uploads\/[\w-]+\.(?:png|jpe?g|gif|webp)$/i;

// Bundled default images (avatars, placeholders) that ship with the app.
const STATIC_IMAGES = path.join(__dirname, "../public/images");
const CLIENT_BUILD = path.join(__dirname, "../../react-frontend/build");

export function createApp(storage: Storage = createStorage()) {
  const app = express();

  // Uploaded images redirect to signed URLs on the storage domain; browsers
  // check the final URL against img-src, so that origin must be allowed.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "img-src": ["'self'", "data:", ...(storage.imageOrigin ? [storage.imageOrigin] : [])],
        },
      },
    })
  );
  if (process.env.NODE_ENV !== "test") app.use(morgan("common"));
  app.use(express.json({ limit: "100kb" }));

  // Images: bundled files first, then user uploads from object storage.
  app.use("/images", express.static(STATIC_IMAGES));
  app.get(
    "/images/*",
    handle(async (req, res) => {
      const key = (req.params as Record<string, string>)[0];
      if (!UPLOAD_KEY.test(key)) {
        res.status(404).json({ error: "Image not found." });
        return;
      }
      await storage.respond(key, res);
    })
  );

  // Uploads are kept in memory (max 5 MB), checked, then written to storage
  // under a server-chosen key. Responds with { filename } for the post.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
    },
  });

  app.post("/api/upload", (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const code = (err as { code?: string }).code;
        res.status(400).json({
          error: code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller." : "Please upload a PNG, JPG, GIF or WebP image.",
        });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "No image was uploaded." });
        return;
      }
      const key = `uploads/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${IMAGE_TYPES[req.file.mimetype]}`;
      storage
        .put(key, req.file.buffer, req.file.mimetype)
        .then(() => res.status(201).json({ filename: key }))
        .catch(next);
    });
  });

  app.get(
    "/api/health",
    handle(async (req, res) => {
      const status = await dbStatus();
      res.status(status.db === "connected" ? 200 : 503).json({ ...status, storage: storage.kind });
    })
  );

  app.use("/api/auth", authRoute);
  app.use("/api/users", userRoute);
  app.use("/api/posts", postRoute);

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // In production, serve the built React app from the same server.
  if (fs.existsSync(CLIENT_BUILD)) {
    app.use(express.static(CLIENT_BUILD));
    app.get("*", (req, res) => res.sendFile(path.join(CLIENT_BUILD, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
