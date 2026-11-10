# D9: Keep the posts feed, but make circles the home screen

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
The app's current home screen is a general posts feed (posts, likes, follows). The product concept says the core value is **relationships inside small reading circles**, and explicitly defers a "complex public feed". The feed already works and is tested.

## Options
1. **Remove the feed.** Simplest product, but throws away working, tested code and a place for readers to share between circles.
2. **Keep the feed as the home screen.** No work, but it pulls attention away from circles, the product's core.
3. **Keep the feed, demote it.** Circles become the signed-in home screen (Phase 1, week 3); the feed moves to its own tab.

## Decision
**Keep the feed and demote it.** When circles ship, the signed-in home screen shows the reader's circles; the posts feed moves to a "Feed" tab. No new feed features (ranking, trends, public discovery) until there's evidence they're needed.

## Why
- Puts the product's core value first without deleting working code.
- The feed stays useful for posts that don't belong to one circle.
- Avoids building a public feed's moderation and ranking problems before the product needs them.

## Consequences
- Navigation gains a "Circles" (home) and "Feed" split in Phase 1.
- Feed posts don't show circle discussion content, so the spoiler rules never have to cover it.
- Revisit after the private alpha: if readers rarely use the feed, remove it.
