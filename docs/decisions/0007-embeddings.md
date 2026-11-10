# D7: Embeddings with Voyage AI, kept reversible

- **Status:** Provisional (confirm after the Phase 2 prototype)
- **Date:** 2026-11-10

## Context
The assistant retrieves book passages by meaning, so each passage needs a vector embedding stored in Postgres (pgvector, see D1). Claude (D6) doesn't generate embeddings, so a separate model is needed. Retrieval quality matters more than raw speed, and the corpus is small (one book, roughly 1,000 passages).

## Options
1. **Voyage AI** (the embeddings provider Anthropic recommends). Strong retrieval quality; hosted API; small cost for a corpus this size.
2. **An open-source model** (e.g. from the BGE or E5 families) run locally or in a job. No API cost or data sharing, but needs compute and setup.
3. **A general LLM vendor's embeddings API.** Adds a second large vendor relationship just for embeddings.

## Decision
**Start with Voyage AI** for the Phase 2 prototype. Make the choice **reversible**: store the embedding model name and dimension with every vector, and keep embedding behind one small module.

## Why
- The fastest way to a good-quality prototype, with little setup.
- At one book, cost is negligible.
- Because vectors are tagged with their model, switching later means re-embedding one table, not a redesign.

## Consequences
- `source_passages` stores `embedding`, `embedding_model` and `embedding_dim`. Queries only compare vectors from the same model.
- **Revisit trigger:** after the first evaluation (plan §5.3). If an open-source model gives equal retrieval quality, prefer it to drop the external dependency.
- Passage text sent to Voyage is public-domain book text only, never user content.
