# Deck + Dashboard

Two separate apps on one GitHub Pages site:
- **Deck** (site root, `index.html`): habits, tasks, chores, campfire. This is also what the Android app opens.
- **Dashboard** (`dashboard/`): weather, news, music, fact of the day. Install it separately from `/dashboard/`.


Weather (Teaneck), headlines, YouTube Music quick-play + KROQ-era rotation, fact of the day.
Plain static files, no build step.

## Customize
Everything lives in the `CONFIG`, `TRACKS` and `FACTS` blocks at the top of the script in index.html:
location, news feeds (any RSS URL), pinned playlists (paste YouTube Music playlist URLs), songs, facts.
After changing files, bump `dash-v1` in sw.js so installed copies pick up the update.

## Put it online (GitHub Pages, free)
1. New public repo, upload these files to the root.
2. Settings → Pages → Deploy from branch → main / root.
3. Open https://<you>.github.io/<repo>/

## Install
- Android (Chrome): open the URL → ⋮ → Add to Home screen / Install app.
- Windows (Edge): open the URL → ⋯ → Apps → Install this site as an app. Pin it to the taskbar,
  or set the URL as your browser homepage.

## Notes
- Weather: Open-Meteo, no key needed.
- News goes through rss2json.com because most RSS feeds block direct browser requests (CORS).
  It's fine for personal use; swap it for your own Cloudflare Worker later if it gets flaky.
- Opening index.html directly from disk works too, but install/offline need it served over https.

## The deck (habits + tasks)
Files: `deck-core.js` (all logic, no DOM, tested), `deck-ui.js` (shared rendering), `deck.css` (Tabletop style),
`deck.html` (tabs: Today, Habits, Curses, Campfire, Settings). The dashboard's "Today's hand" card uses the same code.

- **Tasks:** 3 a day (energy). Unplayed ones wait in a "Later" pile, no guilt list.
- **Habit cards:** routines are combos of links. Schedules: every day, specific days, or X per week.
  Minimum version counts as played. "Excuse today" and Settings → Pause remove days from the record.
- **History-safe:** each link/card keeps a state history, so editing a card never rewrites past days.
- **Day rollover** (default 4am): late-night ticks count for the previous day. A "Last night" strip lets you log
  the evening routine the next morning.
- **Strength:** Loop-style score that fades slowly on misses (no streaks).
- **Relics:** a link becomes a graduation candidate after 28+ days in training, two campfire ratings of 6+, and strength
  ≥ 80%; it graduates if the 4-question automaticity check (SRBAI) averages 6+. Relics can be cracked back.
- **Workout:** rotation derived from the log; skips don't advance it.
- **Campfire:** one per week (Sunday–Saturday window), ratings, relic checks, one friction layer, one draft.
- **Safety:** schema migrations with a backup of the old copy, never overwrites data saved by a newer version,
  daily automatic snapshots (7 days), undo, JSON backup download, save-code **merge** between devices.

## Tests
`node --test tests/core.test.js`

## Notifications (Android)
Reminders are Web Push notifications sent by `.github/workflows/reminders.yml` (GitHub Actions, free).
1. Install the app on the phone (Chrome ⋮ → Install app), open Deck → Settings → Notifications → **Turn on notifications**.
2. Copy the setup code and save it as the repo secret **PUSH_CONFIG** (Settings → Secrets and variables → Actions).
   The code holds this device's private signing key, made on the device; it never goes into backups or save codes.
3. Actions → reminders → **Run workflow** sends a test.

Schedule lives in `reminders.json` (New York times). After editing it run `node scripts/gen-workflow.mjs`.
Each reminder gets an EST and an EDT cron line; the sender only fires the one in effect, so daylight saving is handled.
GitHub may run scheduled jobs a few minutes late. GitHub also pauses scheduled workflows in public repos after
60 days without commits; it emails a warning, and any commit or a click on "Enable workflow" turns them back on.

Tests: `node --test tests/core.test.js` and `node --test tests/push.test.mjs` (needs `npm i web-push` for the last one).

## Android app
`android/` is a Capacitor shell that loads the live site (https://eyrek.github.io/daily-dashboard/), so web changes
reach the app without reinstalling. Inside the app, `deck-notify.js` schedules reminders on the phone with Android's
alarm system (exact times, skips anything done/excused/paused, trash nights follow Settings). No server, no codes.

- Build: `.github/workflows/android.yml` runs on changes to `android/`, `capacitor.config.json` or `package*.json`
  and publishes `dashboard.apk` to the `android-latest` release.
- Install: open https://github.com/eyrek/daily-dashboard/releases/download/android-latest/deck.apk on the phone.
- Signing: `android/app/dashboard.keystore` keeps the signature stable so updates install over the old app.
  It's committed to this public repo for convenience; anyone could sign an app that looks like an update to this one,
  so only install APKs from this repo's release page. Moving the key into a repo secret is the stricter option.
- Data inside the app is separate from Chrome's copy; move it with Settings → Copy save code → Merge.

## Google Calendar (Android app)
`deck-calendar.js` reads the phone's calendar (Google Calendar syncs to it) through `@ebarooni/capacitor-calendar`:
today's events on the hand, the workout session from events named after a session ("Push day"), next week at the
campfire, and ⏰ on a task to open the system event editor. Settings → Calendar picks which calendars to include.
Browser calendar: Sign in with Google (Google Cloud project `deck-514723`, OAuth client "Deck web" limited to
https://eyrek.github.io, testing mode with one test user, read-only Calendar scope). The client ID in
`deck-calendar.js` is public by design. Browser sign-ins last about an hour; then "Refresh calendar" appears.
