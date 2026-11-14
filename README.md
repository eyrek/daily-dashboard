# Daily Dashboard

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
