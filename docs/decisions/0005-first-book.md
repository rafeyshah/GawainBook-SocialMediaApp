# D5: First book is *Pride and Prejudice*

- **Status:** Accepted, pending source verification (see Consequences)
- **Date:** 2026-11-10

## Context
Circles, chapter progress and the AI assistant all need one real book with a reliable chapter structure and a text we're allowed to process and quote. The target niche is fantasy, romantasy and romance readers.

## Options
1. ***Pride and Prejudice*** (Jane Austen, 1813; 61 chapters). Romance, widely read, clear chapter boundaries, ideal for spoiler-trap tests ("Does Elizabeth marry Darcy?").
2. ***The Wonderful Wizard of Oz*** (L. Frank Baum, 1900; 24 chapters). Fantasy, shorter, good for the fantasy audience.
3. **A modern copyrighted title.** Closest to what readers read now, but needs a licence. Not possible at this stage.

## Decision
***Pride and Prejudice* is book #1.** *The Wonderful Wizard of Oz* is the optional book #2, added only after book #1 works end to end.

## Why
- Austen died in 1817 and the novel was published in 1813, so it's public domain in the EU (author dead more than 70 years) and the US (published before 1929).
- Romance fits the target niche; the plot has famous late reveals that make strong spoiler tests.
- 61 chapters is long enough to test progress and locking, and short enough to verify the chapter split by hand.

## Consequences
- **Not yet done:** choose the exact edition and source file, read that source's licence, and record the URL, licence text and retrieval date in `docs/corpus/pride-and-prejudice/SOURCE.md` before any processing (plan §8).
- Strip any distributor header and footer following the distributor's own rules; exclude modern introductions or footnotes.
- Chapter numbering uses `seq` (1–61) so later books with prologues fit the same model.
