// Legal details for the Impressum and privacy notice, from environment
// variables so they're never hard-coded. German law (§ 5 DDG) requires an
// Impressum with a real name, a postal address and a contact email before
// the site collects personal data, so the waitlist stays closed until all
// three are set AND WAITLIST_OPEN=true.

export interface Operator {
  name: string;
  address: string[];
  email: string;
}

export interface LegalConfig {
  operator: Operator | null;
  privacyVersion: string;
  waitlistOpen: boolean;
}

export const DEFAULT_PRIVACY_VERSION = "2026-11-12";
// Bump when the terms change; stored with each account's acceptance.
export const TERMS_VERSION = "2026-11-12";
export const MINIMUM_AGE = 16;

export function legalConfig(env: NodeJS.ProcessEnv = process.env): LegalConfig {
  const name = (env.LEGAL_NAME || "").trim();
  const email = (env.LEGAL_EMAIL || "").trim();
  // Address lines separated by "|" or newlines, e.g. "Street 1|12345 Berlin|Germany".
  const address = (env.LEGAL_ADDRESS || "")
    .split(/\||\\n|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const operator = name && email && address.length >= 2 && /^\S+@\S+\.\S+$/.test(email) ? { name, address, email } : null;
  return {
    operator,
    privacyVersion: (env.PRIVACY_VERSION || DEFAULT_PRIVACY_VERSION).trim(),
    waitlistOpen: env.WAITLIST_OPEN === "true" && operator !== null,
  };
}
