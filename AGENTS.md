# Project guidance

This file holds the rules for anyone working in this repository, human or agent. `CLAUDE.md` imports it.

Security stage: public

Security is rated high: Empire is the only web game with a server and online play, so it gets full security checks, server rules, and abuse limits.

## Spelling

Use American English spelling everywhere: UI text, comments, docs, string values, identifiers, file names, and the word list (`public/words.txt`). For example "color" not "colour", "center" not "centre", "gray" not "grey", "organize" not "organise", "favorite" not "favourite". Fix any British spelling you come across, but never change spelling that is part of an API, a file format, a quotation, or a name.

## Layout

For UI work, read [the responsive layout lessons](docs/responsive-layout.md) before changing screen structure or breakpoints. Preserve the established portrait phone layouts, keep screen and dialog borders inside the viewport, and keep essential actions visible without scrolling. Optimize phone landscape layouts around the main content, especially the game table.
