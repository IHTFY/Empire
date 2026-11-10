# Security notes

Security stage: public. Empire has a server (Cloud Functions and the Realtime Database rules) and online play, so its rules are the trust boundary: anything a page can send, a modified page can send too.

## Open hardening items

The design is sound in each case below; each item would make it tighter. The game is already public, so each one is due in the next hardening pass rather than before a later stage.

- **Secret names are checked only for length on the server.** `database.rules.json` (`secrets/$userId`) limits the length; the allowed characters are enforced only in `public/player-setup.js`. A modified page can submit blank-looking or unusual secrets. Fix: mirror the page's character rule in the rule's `.validate`.
- **Presence has no size limits.** Nothing limits the number of `presence/<id>/connections` entries or watcher entries in a room, and a connection written without a disconnect hook keeps the room counted as live, so the daily sweep never removes it and its name stays taken. The sweep also reads all of `roomNames` and `games` in single reads (`functions/room-lifecycle.js`), so very large junk could make that read fail. Fix: cap connections and watchers in the rules, and have the sweep treat connections that have been silent for a long time as gone.
- **The legacy `users/<id>/fake` field is still accepted, and anyone in the room can read it.** Pages from before secrets moved to `/secrets` send the player's own secret there. Fix: stop accepting it (rules) and stop reading it (`functions/reveal.js`) once no page that old can still be open.
- **The `secrets` delete branch has no membership check.** The third clause of `secrets/$userId` `.write` lets anyone delete a secret whose `users` entry is removed in the same write. It is harmless today, since removing that entry needs its own permission. Fix: add the same membership condition as the other clauses.
- **Hosting sets no security headers, and the deploy workflow's actions are pinned by tag.** `firebase.json` has no content security policy or framing policy. The actions in `.github/workflows/firebase-deploy.yml`, including the ones that receive the deploy key, are pinned to tags, not commit hashes. Fix: add the headers, and pin the actions by commit.

Tracked separately: #144 (text-to-speech allowance), #145 (player limit enforced only in the page), #158 (capture consent).
