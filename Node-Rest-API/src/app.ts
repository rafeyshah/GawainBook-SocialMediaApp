import fs from "fs";
import path from "path";
import crypto from "crypto";
import express, { Request, RequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { dbStatus } from "./db/client";
import { API_VERSION } from "./version";
import { errorHandler, handle } from "./http";
import { createStorage, Storage } from "./storage";
import { csrfProtection, requireAuth } from "./auth";
import { LegalConfig, legalConfig } from "./legal";
import { authRouter } from "./routes/auth";
import userRoute from "./routes/users";
import { postCommentRouter, postRouter } from "./routes/posts";
import { legalRouter, waitlistRouter } from "./routes/waitlist";
import bookRoute from "./routes/books";
import { circleRouter } from "./routes/circles";
import { safetyRouter } from "./routes/safety";
import { accountRouter } from "./routes/account";
import { adminRouter } from "./routes/admin";
import { createMailer, Mailer } from "./mailer";
import { bookSearchRouter } from "./routes/books";
import { OpenLibrary, COVER_IMAGE_ORIGINS } from "./openLibrary";
import { Gutenberg } from "./gutenberg";
import { LoginThrottle } from "./loginThrottle";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
// What an upload really is, from its first bytes. The type the browser declares
// is only a claim; a file is accepted only if its contents match an image type.
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

// Request URLs as logged: email-link tokens are blanked so logs never hold a usable link.
export const redactUrl = (url: string): string => url.replace(/([?&#]token=)[^&#\s]*/gi, "$1[redacted]");

// Proxies between the internet and this app. On Render that's Cloudflare and
// then Render's load balancer (TRUST_PROXY_HOPS=2); each appends the address it
// saw to X-Forwarded-For, so counting hops from the right gives the real client
// and anything a client writes into the header itself is ignored.
export function proxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.TRUST_PROXY_HOPS ?? 1);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

// Keys the /images route will look up in storage.
export const UPLOAD_KEY = /^uploads\/[\w-]+\.(?:png|jpe?g|gif|webp)$/i;

// Bundled default images (avatars, placeholders) that ship with the app.
const STATIC_IMAGES = path.join(__dirname, "../public/images");
const CLIENT_BUILD = path.join(__dirname, "../../react-frontend/build");

export interface Limit {
  windowMs: number;
  max: number;
}

export interface AppOptions {
  storage?: Storage;
  legal?: () => LegalConfig;
  limits?: Partial<Record<LimitName, Limit>>;
  openLibrary?: OpenLibrary;
  gutenberg?: Gutenberg;
  mailer?: Mailer;
}

export type LimitName = "auth" | "login" | "upload" | "waitlist" | "posting";

// Defaults: generous for real readers, tight enough to stop brute force.
export const DEFAULT_LIMITS: Record<LimitName, Limit> = {
  auth: { windowMs: 15 * 60 * 1000, max: 10 },
  // Failed sign-ins per account, whatever address they come from.
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  // Discussions, replies, edits and reports, per reader.
  posting: { windowMs: 10 * 60 * 1000, max: 30 },
  upload: { windowMs: 60 * 60 * 1000, max: 30 },
  waitlist: { windowMs: 60 * 60 * 1000, max: 5 },
};

const limiter = ({ windowMs, max }: Limit, message: string, perUser = false): RequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    // Signed-in limits count per reader, so a shared network isn't punished.
    ...(perUser ? { keyGenerator: (req) => `user:${req.user?.id ?? req.ip}` } : {}),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: message });
    },
  });

export function createApp(options: AppOptions = {}) {
  const storage = options.storage ?? createStorage();
  const getLegal = options.legal ?? (() => legalConfig());
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const limit = {
    auth: limiter(limits.auth, "Too many attempts. Please wait a few minutes and try again."),
    upload: limiter(limits.upload, "You've uploaded a lot of photos. Please try again later."),
    waitlist: limiter(limits.waitlist, "Too many sign-ups from this network. Please try again later."),
    posting: limiter(limits.posting, "You're posting very quickly. Please wait a few minutes and try again.", true),
  };
  const loginThrottle = new LoginThrottle(limits.login);
  const openLibrary = options.openLibrary ?? new OpenLibrary();
  const mailer = options.mailer ?? createMailer();

  const app = express();
  // Rate limits need the real client IP, and req.secure must be right behind HTTPS proxies.
  app.set("trust proxy", proxyHops());

  // Uploaded images redirect to signed URLs on the storage domain; browsers
  // check the final URL against img-src, so that origin must be allowed.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "img-src": ["'self'", "data:", ...COVER_IMAGE_ORIGINS, ...(storage.imageOrigin ? [storage.imageOrigin] : [])],
        },
      },
    })
  );
  // Features the app never uses stay off, even if injected content asks for them.
  app.use((req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
    next();
  });
  morgan.token("safe-url", (req: Request) => redactUrl(req.originalUrl || req.url));
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length]'));
  }
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(csrfProtection);

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

  app.post("/api/upload", requireAuth, limit.upload, (req, res, next) => {
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
      // Stored under the type its contents prove, not the one the browser claimed.
      const type = sniffImageType(req.file.buffer);
      if (!type) {
        res.status(400).json({ error: "Please upload a PNG, JPG, GIF or WebP image." });
        return;
      }
      const key = `uploads/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${IMAGE_TYPES[type]}`;
      storage
        .put(key, req.file.buffer, type)
        .then(() => res.status(201).json({ filename: key }))
        .catch(next);
    });
  });

  app.get(
    "/api/health",
    handle(async (req, res) => {
      // Public: only whether it's up and which API version runs. Details go to the server log.
      const { db, error } = await dbStatus();
      if (error) console.error("Health check: database unavailable:", error);
      res.status(db === "connected" ? 200 : 503).json({ db, apiVersion: API_VERSION });
    })
  );

  app.use("/api/auth", authRouter(limit, mailer, loginThrottle));
  app.use("/api", accountRouter(mailer, limit.auth, loginThrottle));
  app.use("/api", adminRouter());
  app.use("/api/users", userRoute);
  app.use("/api/posts", postRouter(limit.posting));
  app.use("/api", postCommentRouter(limit.posting));
  app.use("/api", bookSearchRouter(openLibrary, limit.posting, options.gutenberg ?? new Gutenberg()));
  app.use("/api", bookRoute);
  app.use("/api", circleRouter(limit.posting));
  app.use("/api", safetyRouter());
  app.use("/api/legal", legalRouter(getLegal));
  app.use("/api/waitlist", waitlistRouter(getLegal, limit.waitlist));

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
