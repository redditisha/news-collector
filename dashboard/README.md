# News Monitor — online dashboard

A read-only copy of the News Monitor app that runs on Vercel and reads the
Google Sheet the collector writes, so it works when the PC is off.

It shows the last few weeks the sheet keeps (`SHEET_RETENTION_DAYS` on the
PC), a week at a time, with the stories, watchlists and translations the PC
publishes there on every sync. Headlines the PC hasn't translated yet have a
**Translate** button (Google Translate, one headline at a time), which also
saves the translation into the sheet.

Everything else — editing sources and watchlists, saved folders, mute rules —
happens in the app on the PC.

## Vercel setup

1. Import this repository in Vercel and set **Root Directory** to `dashboard`.
2. Environment variables (Project → Settings → Environment Variables):
   - `SHEET_ID` — the Google Sheet's id
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the service account key JSON (same as the
     GitHub Actions secret)
3. Node.js version: 22.x (Project → Settings → General).
4. Deploy. `NEXT_PUBLIC_DATA_SOURCE=sheet` is already set in `.env.production`,
   and `vercel.json` installs without build scripts (the SQLite library ships
   ready-made binaries).

This folder is generated from the PC's app by `local/export_dashboard.py` —
change the app there and re-export rather than editing here.
