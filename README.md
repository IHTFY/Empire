<p align="center">
  <img src="logo.png" alt="Empire logo" width="128" height="128" />
</p>

<h1 align="center">Empire</h1>

<p align="center">A party game of secret names. Guess who is who and build the last empire standing.</p>

<p align="center">
  <a href="https://empire.ihtfy.com"><strong>Play Empire</strong></a>
  · <a href="#start-a-game">Start a game</a>
  · <a href="#how-to-play">How to play</a>
  · <a href="#local-development">Local development</a>
  · <a href="#deploying">Deploying</a>
</p>

## Start a game

1. Open [empire.ihtfy.com](https://empire.ihtfy.com), choose **Create a room**, and keep the suggested room name or enter your own. Tap **Create**.
2. Enter your name and a secret name, then tap **Enter the lobby**. You can also tap your crest to customize it.
3. Tap **Share link** in the lobby. It opens your device's share menu or copies the room link. Friends can also choose **Join a room** on the home screen and enter the room name and password shown in the lobby.
4. For a smaller group, tap **Add a bot player** to add extra secret names.
5. Once everyone is in, tap **Reveal the names**. The app shows and reads the names in random order. Tap **Reveal the names** again for the second reading, then start guessing aloud.

Names lock after the first reveal. Anyone who joins after that can watch and play in the next round.

When a new version is deployed, an open tab or installed app shows an **Update** toast. Tap it to reload and return to your room. The app checks once a minute while visible and when you return to it. Updating keeps your saved names and crest.

## How to play

Be the leader of the last empire standing. Everyone starts as the leader of their own empire.

1. Pick a secret name you hope nobody will associate with you.
2. Memorize the names during the two readings. Do not write them down or record them. After that, only reread the list if all remaining leaders agree.
3. Take turns clockwise around your group. Only empire leaders take turns.
4. On your turn, choose another leader and guess their secret name.

| Your guess | What happens |
| --- | --- |
| Wrong | Your turn ends. The next leader takes a turn. |
| Right | That leader and their whole empire join yours. You guess again. |

Empire members can discuss guesses and help protect their leader's secret name. Only the leader makes official guesses. The last leader whose secret name has never been guessed wins.

### At the table

The group makes and judges guesses aloud. Use the app to keep track of the round.

| Control | What it does |
| --- | --- |
| Table / List | Switches between seats around a table and a roster grouped by empire. |
| Flag beside a player | Records a capture. Choose the leader whose empire they joined. The captured player, or someone in their empire, confirms it; if they tap it themselves it applies right away. Their whole empire moves with them. Tap their undo control and confirm to reverse a capture. |
| Remove a bot | Reveals its secret name to everyone after the round starts and removes that name from future readings. |
| Reveal the names | Reveals or replays the list. Get agreement from every remaining leader first. |
| Room options | Lets you change your names before the reveal, adjust sound, open the rules, or leave. |
| New round | Sends everyone back to pick new names. The room and its link stay the same. |
| End room | Removes everyone and returns them to the home screen. |

## Local development

Use **Node.js 22**, **pnpm 12.8.1**, and **Java 21 or newer**.

```sh
pnpm install --frozen-lockfile
pnpm install --frozen-lockfile --dir functions
pnpm dev
```

Open [localhost:15000](http://localhost:15000). To test on another device, use the development machine's LAN address on port 15000.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds readable browser JavaScript and CSS, watches source changes, and starts the Firebase emulators. |
| `pnpm build` | Builds minified production assets once into `public/assets/`, as preview and live deployment do. Git ignores these generated files. |
| `pnpm lint` | Lints the browser code, build scripts, and Cloud Functions. |
| `pnpm test` | Runs regression tests. |
| `pnpm test:layout` | Checks screen and panel bounds at phone, tablet, and desktop sizes, including short viewports. Run `pnpm exec playwright install chromium` once first. |
| `pnpm test:integration` | Builds the site, starts the emulators, checks database rules, and runs a whole-game scenario. Stop `pnpm dev` first. |

The integration scenario covers create, join, reveal, reset, a new round, and ending the room. It also checks outsider denial and private reveal ownership. These checks need no deploy credentials.

<details>
<summary>Emulator ports and local behavior</summary>

| Service | Port |
| --- | --- |
| Hosting | 15000 |
| Authentication | 19099 |
| Realtime Database | 19000 |
| Functions | 15001 |
| Emulator UI | [14000](http://localhost:14000) |

The local browser connects to the emulators using the demo project `demo-empire-local` and database instance `demo-empire-local-default-rtdb`. Name readings use the device's voice without Cloud Text-to-Speech requests. Emulator data is temporary and disappears when the suite stops.

Use these ports only on a trusted local network. The emulator admin API is unauthenticated.

</details>

### Code organization

Empire is a static browser app backed by Firebase Realtime Database and Cloud Functions. The [code structure guide](docs/code-structure.md) explains the modules, controller interactions, styles, and browser build.

Read the [responsive layout lessons](docs/responsive-layout.md) before changing screen layouts. They record the phone layout preferences and the checks needed to preserve them.

## Deploying

[GitHub Actions](.github/workflows/firebase-deploy.yml) deploys the site, Cloud Functions, and database rules to the Firebase project `empire-ihtfy`.

| Trigger | Result after checks pass |
| --- | --- |
| Pull request opened or reopened | Eligible same-repository PRs get a site preview link in a PR comment, valid for 24 hours. Fork and Dependabot PRs run checks without a preview. |
| PR update whose latest commit contains `[preview]` | Refreshes the PR's existing site preview after checks pass. Other updates run checks without redeploying the preview. |
| Push to `master` | Deploys Hosting, Functions, and database rules. |
| Manual workflow run on `master` | Runs the same deployment through Actions > Firebase > Run workflow. |

Checks include lint, a production dependency audit for `functions/`, regression tests, and integration tests. **Preview sites use the live database and functions.** They preview site changes only.

Add `[preview]` to the latest commit's subject or body when a PR is ready for another preview. If pushing several commits together, put the marker on the last one. To refresh a preview without changing files:

```sh
git commit --allow-empty -m "Refresh preview [preview]"
git push
```

The preview keeps the same URL. Wait for the `preview` job to finish, then reload the page. These PR preview controls do not change deployments from `master`.

Each deployment sets the preview to expire after 24 hours; existing channels retain their prior expiration until redeployed or edited. Manage old previews in [Firebase Hosting](https://console.firebase.google.com/project/empire-ihtfy/hosting): in **Preview channels**, use **⋮ → Delete channel** for a merged or closed PR, or **Channel settings** to edit its expiration.

<details>
<summary>One-time deployment setup</summary>

1. In the [Google Cloud console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=empire-ihtfy), create a service account such as `github-deploy`.
2. Grant it these roles:
   - Firebase Admin
   - Cloud Functions Admin
   - Service Account User
   - Artifact Registry Administrator
   - Cloud Build Editor
3. Create a JSON key under Keys > Add key > JSON.
4. In GitHub, open Settings > Secrets and variables > Actions > New repository secret. Name it `FIREBASE_SERVICE_ACCOUNT` and paste the whole JSON file as the value.

</details>

<details>
<summary>Manual deployment</summary>

Install dependencies, sign in, and deploy with the repository's Firebase CLI. Hosting's predeploy step builds the browser assets.

```sh
pnpm install --frozen-lockfile
pnpm install --frozen-lockfile --dir functions
pnpm exec firebase login
pnpm exec firebase deploy --project empire-ihtfy --only hosting,functions,database
```

</details>

<details>
<summary>Rolling back</summary>

| Component | How to restore an earlier version |
| --- | --- |
| Site | In the Firebase console, open Hosting > Release history, choose an earlier release, and select Rollback. |
| Functions | Check out an earlier commit, install its dependencies, and run `pnpm exec firebase deploy --project empire-ihtfy --only functions`. |
| Database rules | Restore a version from Firebase console > Realtime Database > Rules. Update `database.rules.json` to match before the next deployment. |

</details>
