# D6: One AI provider, Anthropic Claude

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
Phase 2 adds a spoiler-aware reading assistant that answers only from passages the reader has reached, cites them, and declines when unsure. The project has a solo developer and a small budget, so every extra integration costs time and attention.

## Options
1. **One provider (Anthropic Claude)** with a small model for routine answers and a larger one only where the evaluation shows it's needed.
2. **Several providers behind a router.** Flexible, but more code, more keys, more cost models and more evaluation work.
3. **Self-hosted open models.** No per-call cost, but hosting, GPUs and maintenance are out of scope.

## Decision
Use **Anthropic Claude only.** Start with the small, fast tier (currently **Claude Haiku 5.5**, `claude-haiku-5-5`); move individual tasks up to **Claude Sonnet 5.5** (`claude-sonnet-5-5`) only if the evaluation (plan §5.3) shows the small model isn't good enough.

## Why
- One SDK, one bill and one set of limits to monitor.
- Strong instruction-following and citation behaviour suits "answer only from these passages".
- The evaluation decides when the larger model is worth its cost, rather than guesswork.

## Consequences
- Claude doesn't provide embeddings, so embeddings are a separate decision ([D7](0007-embeddings.md)).
- Set a hard monthly spend limit at the provider and a per-user daily quota in the app (plan §13).
- **Check current model names and prices in Anthropic's docs when implementing**; record the model id with every logged answer so results stay comparable.
- An AI disclosure goes live with the feature (plan §12).
