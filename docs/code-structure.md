# Code structure

Empire is a static browser app backed by Firebase Realtime Database and Cloud Functions.
The source files are organized by responsibility. There is no frontend framework.

## Browser code

`public/script.js` is the entry point. It waits for Firebase initialization, starts
anonymous authentication, creates the controllers, and opens the room from the URL.
Read it first to see how the app is connected.

| Source | Owns |
| --- | --- |
| `home.js` | Create/join form, suggested room names, credential lookup |
| `rooms.js` | Current room data, room subscriptions, entry/exit, room and player actions |
| `room-presence.js` | Current connection, disconnect cleanup, away timer |
| `player-setup.js` | Name inputs, secret field, validation, submission |
| `crest-picker.js` | Editable crest, picker controls, local persistence |
| `lobby/render.js` | Roster order, stable player elements, table/list rendering |
| `lobby/seating.js` | Ring geometry and placement history |
| `lobby/transitions.js` | View preference and table/list transition animations |
| `reveal.js` | Server-clock playback, cancellation, eliminated-bot announcements |
| `audio.js` | Sound preferences, audio context, decoded clips, speech and reverb |
| `ui.js` | Screens, toasts, marquee fitting, rolling numbers |
| `sheets.js` | Dialog buttons, animation, drag-to-dismiss gestures |
| `bots.js` | Word-list loading and adding bots |
| `share.js` | Native sharing and clipboard fallback |

`crest.js`, `room-names.js`, and `presence.js` are focused data/formatting helpers.
`config.js` contains client limits and timing; `dom.js` provides the DOM lookup helper.
`firebase-emulators.js` selects local or hosted Firebase initialization.
`service-worker.js` handles the offline navigation fallback.

### How controllers communicate

Controllers are created after the DOM is ready. Each keeps its mutable state inside
its own factory function. Dependencies are named arguments, and `script.js` supplies
callbacks for operations that cross controller boundaries. There are no circular imports.

For example, a room's users subscription updates the roster owned by `rooms.js`,
tells `reveal.js` to remember bot names, and asks `lobby/render.js` to render. Starting
a reveal calls the reveal controller; leaving the room or changing out of `playing`
cancels it. Leaving also unsubscribes room listeners, stops presence, and resets the lobby.

`rooms.getSnapshot()` exposes the current room data. Consumers treat it as read-only
and use room methods for actions. Synchronous rendering can read one snapshot; work
that crosses an `await` checks current room identity again before changing the UI or
database. Reveal playback also checks its cancellation token so an old run cannot
complete a later run.

When adding a feature, keep its event handlers and state with its controller. Connect
a new cross-controller action in `script.js`, rather than importing another controller's
state or putting unrelated helpers into a general utility file.

## Styles and build

`public/style.css` lists the imports in their original cascade order. The sections
live in `public/styles/`: base/layout, controls, home, setup, lobby, reveal, crests,
settings/dialogs, responsive overrides, and rolling numbers. Keep their order stable
when moving rules. Keyframes stay with their components; responsive overrides remain
later in the cascade.

`pnpm build` uses [esbuild](https://esbuild.github.io/api/#bundle) to combine the
browser sources into `public/assets/script.js` and `public/assets/style.css`.
`index.html` loads those two assets. Splitting source files does not add browser requests.
The Firebase SDK and other existing external resources remain separate.

`pnpm build` (used by deployment) minifies the bundles; `pnpm dev` leaves them readable. Both write
external source maps for debugging, and Git ignores the output.
Edit the source modules, not `public/assets/`. `pnpm dev` builds first and watches
source changes while the emulators run. Integration checks, preview CI, and normal
Hosting deployments build the assets before serving or publishing them.

## Cloud Functions

`functions/index.js` registers the deployed function names and trigger paths.
Implementation is split into:

- `firebase.js`: one Admin SDK initialization and emulator/live database selection.
- `reveal.js`: authenticated reveal claims, reread indexes, bot-secret announcements.
- `reveal-state.js`: transaction guard for asynchronous writes to a specific reveal.
- `voice.js`: speech recording, cache, quota, readiness deadline, advance recording.
- `room-lifecycle.js`: round reset and abandoned-room/voice-cache cleanup.

The reveal guard is separate so both playback preparation and late voice recordings
use it without a circular dependency. Database schemas, rules, function names, and
trigger paths remain unchanged by this organization.

## Verification

Use Node.js 22 and Java 21 or newer. Run `pnpm test` for regression tests and
`pnpm lint` for browser/build-script and backend lint. Stop the development emulators
before running `pnpm test:integration`, which builds the site, checks database
rules, and exercises the actual callable and triggers through a whole-game scenario.

The unit harness in `functions/test/support/functions.cjs` loads the CommonJS modules
in separate scopes with fake Firebase services. Recording overrides are applied before
the importing handler loads, so the tests still exercise delayed and canceled reveals.
For browser changes, also check create/join, name editing, table/list transitions,
reveal/reread, bot removal, reset, reload, and leave at phone and desktop sizes.
