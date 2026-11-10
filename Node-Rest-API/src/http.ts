import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Express 4 doesn't catch rejected promises; route them to the error handler.
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };

type PgError = { code?: string; constraint?: string };
type WrappedError = { cause?: unknown; status?: number; expose?: boolean; type?: string };

// Drizzle wraps driver errors (DrizzleQueryError); the Postgres details are on `cause`.
export const pgErrorOf = (err: unknown): PgError => {
  const wrapped = err as WrappedError | null;
  const inner = wrapped && wrapped.cause && typeof wrapped.cause === "object" ? wrapped.cause : err;
  return (inner || {}) as PgError;
};

// Turns known errors into clear 4xx responses; everything else is a 500
// with no internal details.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Client errors raised by Express middleware (e.g. body too large, bad JSON).
  const wrapped = err as WrappedError | null;
  if (wrapped && wrapped.expose && typeof wrapped.status === "number" && wrapped.status >= 400 && wrapped.status < 500) {
    const message =
      wrapped.type === "entity.too.large"
        ? "That request is too large."
        : wrapped.type === "entity.parse.failed"
        ? "The request body isn't valid JSON."
        : "The request couldn't be processed.";
    res.status(wrapped.status).json({ error: message });
    return;
  }
  const pg = pgErrorOf(err);
  if (pg && pg.code === "23505") {
    res.status(409).json({ error: uniqueMessage(pg.constraint) });
    return;
  }
  if (pg && (pg.code === "23514" || pg.code === "22P02" || pg.code === "22003")) {
    res.status(400).json({ error: "Some of the details are invalid." });
    return;
  }
  if (pg && pg.code === "23503") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

export function uniqueMessage(constraint?: string): string {
  if (constraint === "users_email_unique") return "An account with this email already exists. Try signing in.";
  if (constraint === "users_username_unique") return "That username is taken. Please choose another.";
  return "That already exists.";
}

// Ids are UUIDs, or 24-hex ObjectId strings for rows migrated from MongoDB.
const ID_PATTERN = /^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const isId = (value: unknown): value is string => typeof value === "string" && ID_PATTERN.test(value);
