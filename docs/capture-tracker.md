# Capture players: tracker

Goal: humans get a "captured" button (bots keep the X). Captured players join a leader's
empire: avatar copies leader's crest (burn-style morph), seats next to the leader, list sorted
by empire size (captured rows dimmed), empire size shown.

## Decisions (from user)
- Any room member can claim; a sheet asks which leader captured the player (default: tapper's own leader). Humans only, bots excluded as captor and captive. Only after reveal (`locked`).
- Capturing a leader moves their whole empire; announce only the leader (one toast/animation event).
- Undo available on the directly captured player; followers who moved with them come back to them. Cleared each new round.
- Captured avatar = same crest as leader, own initial kept. Size badge shows on leaders of 2+.

## Data model
`games/$id/captures/$uid = { leader, via, back? }` (`via` = directly claimed player; groups undo).
Followers of a captured leader are rewritten to the new leader with that `via`, keeping their old via in `back`; undo returns them to the released player.
Client ignores entries whose player/leader is gone.

## Status
- [x] database.rules.json `captures` + room-lifecycle reset list
- [x] rooms.js: listener, capturePlayer, releasePlayer, snapshot.captures
- [x] lobby/render.js: empires, list sorted by size, captured dimmed, size badge, flag/undo buttons, capture sheet, toast for the directly captured player
- [x] lobby/seating.js `attach` seats a captured player beside the leader
- [x] index.html sheet + `i-flag` icon + styles + `captured-in` avatar animation
- [x] rules test (passes), lint, build
- [x] Browser check with headless Chromium (390px and 1280px): claim sheet, morph, seats beside leader, whole-empire move, list grouping, toast, undo returning followers
- [x] Full-screen capture announcement (`#captureScreen`, `reveal.announceCapture`): captive crest burns into the captor's, member counts transfer one by one with ticks, chime; queued with bot announcements
- [ ] Possible polish: README note; check badge/button crowding on 2-3 ring tables (12+ players); captured crest keeps the captive's initial, so verify it reads well with custom crests

## Notes
- Package manager is pnpm (`pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm test`). pnpm 12 needs dependency build scripts approved in `pnpm-workspace.yaml` (`allowBuilds`, root and `functions/`); the uuid override lives in `functions/pnpm-workspace.yaml`. Cloud Functions builds use pnpm because of `functions/pnpm-lock.yaml`, pinned by `engines.pnpm`.
- A stray database emulator holds port 19000 here; stop it before `pnpm dev`. Rules tests can run against it: `FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:19000 pnpm --dir functions test:rules`.
