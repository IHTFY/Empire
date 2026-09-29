# [Play Empire](https://empire.ihtfy.com)

## Setup
1. Create a new room at [empire.ihtfy.com](https://empire.ihtfy.com)
   * Name the room or leave it blank to generate a random name
2. Click `GET GAME LINK` and share with your friends
   * Or simply have them go to [empire.ihtfy.com](https://empire.ihtfy.com) and type in the game code
3. Enter your display name and secret name, then `SUBMIT`
4. You will see who has entered the lobby
5. If you have a small party, you can add fake names under the `OPTIONS` menu
6. Once everybody is ready to play, have someone press "START" to reveal the secret names

## How to Play

**Objective**: Be the leader of the final empire.

### Rules:
1. Each player picks a secret name (any word that they hope won't be associated with them)
2. The list of secret names is read twice in random order, and players are meant to memorize as many names as they can
	- No recording of any information is allowed
	- The name list can be read again at any point if unanimously agreed by all the remaining leaders
3. Turns are taken clockwise around the circle of players
	- Only leaders of empires take turns
4. The first leader chooses another leader and guesses their secret word
	- If they are wrong, their turn is over, and the next leader can guess
	- If they are right, the other player is now part of their empire and the leader gets to guess again
5. The winner is the last leader standing; the one whose secret name is never guessed

#### Notes:
- When a leader is conquered by another leader, their whole empire goes along with them
- All member of each empire should cooperate to guess the remaining leaders' secret names and protect the secret name of their leader
- Only the leader of an empire can make official guesses; other members can talk, but any guesses don't count as a turn for their empire

## Deploying

The site (`public/`) and the `flashNames` Cloud Function (`functions/`) deploy to the `empire-ihtfy` Firebase project through GitHub Actions (`.github/workflows/firebase-deploy.yml`):

- **Pull requests:** install, lint and audit `functions/` only.
- **Push to `master`** (or **Actions → Firebase → Run workflow**): the checks run, then `firebase deploy --only hosting,functions,database`.

### One-time setup
1. In the [Google Cloud console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=empire-ihtfy), create a service account (for example `github-deploy`).
2. Grant it these roles:
   - Firebase Admin
   - Cloud Functions Admin
   - Service Account User
   - Artifact Registry Administrator
   - Cloud Build Editor
3. Create a JSON key for it: Keys → Add key → JSON.
4. In GitHub, go to Settings → Secrets and variables → Actions → New repository secret. Name it `FIREBASE_SERVICE_ACCOUNT` and paste the whole JSON file as the value.

### Manual deploy (fallback)
```sh
npm install -g firebase-tools
firebase login
npm ci --prefix functions
firebase deploy --project empire-ihtfy --only hosting,functions,database
```

### Rolling back
- **Site:** Firebase console → Hosting → Release history → pick an earlier release → Rollback.
- **Function:** check out an earlier commit and deploy it with `firebase deploy --only functions`.
- **Database rules:** they live in `database.rules.json`. Firebase console → Realtime Database → Rules keeps a version history you can restore from.
