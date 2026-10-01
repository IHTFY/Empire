# Capture players: tracker

Goal: humans get a "captured" button (bots keep the X). Captured players join a leader's
empire: avatar copies leader's crest (burn-style morph), seats next to the leader, list sorted
by empire size (captured rows dimmed), empire size shown.

## Decisions (from user)
- Any room member can claim; a sheet asks which leader captured the player (default: tapper's own leader). Humans only, bots excluded as captor and captive. Only after reveal (`locked`).
- Capturing a leader moves their whole empire; announce only the leader (one toast/animation event).
- Undo available on the directly captured player (restores their followers too). Cleared each new round.
- Captured avatar = same crest as leader, own initial kept.

## Data model
`games/$id/captures/$uid = { leader, via }` (`via` = directly claimed player; groups undo).
Followers of a captured leader are rewritten to the new leader with the same `via`.
Client ignores entries whose player/leader is gone.

## Status
- [x] database.rules.json `captures` + room-lifecycle reset list
- [x] rooms.js: listener, capturePlayer, releasePlayer, snapshot.captures
- [x] lobby/render.js: empires, list sorted by size, captured dimmed, size badge, flag/undo buttons, capture sheet, toast for the directly captured player
- [x] lobby/seating.js `attach` seats a captured player beside the leader
- [x] index.html sheet + `i-flag` icon + styles + `captured-in` avatar animation
- [x] rules test (passes), lint, build
- [ ] Manual check in a browser (`pnpm dev`): seat adjacency, animation look, narrow screens, sheet
- [ ] Possible polish: README note; tune badge/button placement on 3-ring tables
