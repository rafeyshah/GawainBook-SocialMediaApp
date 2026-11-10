import { RequestHandler, Router } from "express";
import { getDb } from "../db/client";
import { waitlistEntries } from "../db/schema";
import { handle, HttpError } from "../http";
import { LegalConfig } from "../legal";
import { normalizeEmail } from "./auth";

export const GENRES = [
  "fantasy",
  "romantasy",
  "romance",
  "science-fiction",
  "mystery-thriller",
  "literary",
  "classics",
  "non-fiction",
  "other",
] as const;

export const JOINED_MESSAGE = "Thanks! You're on the list. We'll email you when there's a spot.";

// Public: who runs the site (Impressum) and whether the waitlist is open.
export function legalRouter(getConfig: () => LegalConfig) {
  const router = Router();
  router.get("/", (req, res) => {
    const { operator, privacyVersion, waitlistOpen } = getConfig();
    res.json({ operator, privacyVersion, waitlistOpen });
  });
  return router;
}

export function waitlistRouter(getConfig: () => LegalConfig, limit: RequestHandler) {
  const router = Router();

  router.post(
    "/",
    limit,
    handle(async (req, res) => {
      const config = getConfig();
      if (!config.waitlistOpen) throw new HttpError(503, "The waitlist isn't open yet.");

      // Honeypot: real people never see or fill this field.
      if (req.body.website) {
        res.status(201).json({ message: JOINED_MESSAGE });
        return;
      }

      const email = normalizeEmail(req.body.email);
      const genre = String(req.body.favouriteGenre ?? "");
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new HttpError(400, "Please enter a valid email address.");
      if (!(GENRES as readonly string[]).includes(genre)) throw new HttpError(400, "Please choose your favourite genre.");
      if (typeof req.body.organizesBookClub !== "boolean") {
        throw new HttpError(400, "Please tell us whether you organise a book club.");
      }
      if (req.body.consent !== true) throw new HttpError(400, "Please agree to the privacy notice to join.");

      // Joining twice is not an error, and the response never reveals
      // whether an email was already on the list.
      await getDb()
        .insert(waitlistEntries)
        .values({ email, favouriteGenre: genre, organizesBookClub: req.body.organizesBookClub, privacyVersion: config.privacyVersion })
        .onConflictDoNothing();
      res.status(201).json({ message: JOINED_MESSAGE });
    })
  );

  return router;
}
