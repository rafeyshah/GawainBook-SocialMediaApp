// Failed sign-ins counted per account (email), not per IP: an attacker who
// spreads guesses over many addresses still gets only `max` tries per window.
// Unknown emails are counted the same way, so the limit says nothing about
// which accounts exist. Kept in memory: the app runs as a single instance.

export interface ThrottleOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  // Cap on remembered emails, so a flood of made-up addresses can't grow memory without bound.
  maxEntries?: number;
}

export class LoginThrottle {
  private readonly entries = new Map<string, { failures: number; resetAt: number }>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(private readonly options: ThrottleOptions) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 50_000;
  }

  private current(email: string) {
    const entry = this.entries.get(email);
    if (entry && entry.resetAt <= this.now()) {
      this.entries.delete(email);
      return undefined;
    }
    return entry;
  }

  // True once `max` failures have been recorded for this email in the window.
  isLocked(email: string): boolean {
    return (this.current(email)?.failures ?? 0) >= this.options.max;
  }

  recordFailure(email: string): void {
    const entry = this.current(email);
    if (entry) {
      entry.failures += 1;
      return;
    }
    if (this.entries.size >= this.maxEntries) this.prune();
    this.entries.set(email, { failures: 1, resetAt: this.now() + this.options.windowMs });
  }

  // A successful sign-in (or password reset) starts the count again.
  clear(email: string): void {
    this.entries.delete(email);
  }

  private prune(): void {
    const now = this.now();
    for (const [email, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(email);
    // Still full of live entries: drop the oldest (Map keeps insertion order).
    while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }

  get size(): number {
    return this.entries.size;
  }
}
