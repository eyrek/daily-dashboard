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
