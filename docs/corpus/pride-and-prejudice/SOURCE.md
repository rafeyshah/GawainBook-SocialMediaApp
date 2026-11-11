# Source: *Pride and Prejudice*

Book #1 for GawainBook ([D5](../../decisions/0005-first-book.md)).

| | |
|---|---|
| Work | *Pride and Prejudice*, Jane Austen (1775–1817), first published 1813 |
| Edition | George Allen, London, 1894. Preface by George Saintsbury, illustrations by Hugh Thomson (1860–1920) |
| Source | Project Gutenberg eBook #1342 |
| URL | https://www.gutenberg.org/cache/epub/1342/pg1342.txt (book page: https://www.gutenberg.org/ebooks/1342) |
| File | [`pg1342.txt`](pg1342.txt): UTF-8, CRLF line endings, 772,386 bytes |
| SHA-256 | `3f6bb9d6f78e0293b56acd4714dd68cb7d6d1d293402031ce9d5a216bcaf9d75` |
| Gutenberg dates | Released 1 June 1998; most recently updated 1 September 2026 |
| Downloaded | 11 November 2026 |
| Chapters | 61, numbered I–LXI (two headings sit inside illustration captions: I and XLVI) |

## Licence and rights

- **United States:** Project Gutenberg says the text is not protected by US copyright. The Gutenberg header reads: *"This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org."*
- **Germany / EU:** copyright lasts 70 years after the author's death. Austen died in 1817; the preface's author Saintsbury died in 1933 and the illustrator Thomson in 1920, so all parts of this edition are public domain in Germany and the EU.
- **Trademark:** "Project Gutenberg" is a trademark. When we use only the text, without the Gutenberg header and footer and without mentioning Gutenberg as a brand on the product, the trademark licence does not apply. The chapter splitter strips the header and footer.
- **Illustrations:** not used. The splitter removes `[Illustration]` markers and captions.

## How it's used

[`Node-Rest-API/src/corpus/gutenberg.ts`](../../../Node-Rest-API/src/corpus/gutenberg.ts) splits this file into 61 chapters and refuses a text whose chapters are missing, repeated or out of order. [`tests/corpus.test.ts`](../../../Node-Rest-API/tests/corpus.test.ts) checks the file against the checksum above, the chapter count against the seeded book, and that no licence text or illustration markup leaks into a chapter.

To update the text: download it again, update the size, checksum and dates here, and run the tests.
