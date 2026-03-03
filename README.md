# GoodGoodStudy

Local-first study tracking for interview prep, with entry management, focus sessions, and daily journaling.

Built with React, Vite, TypeScript, and Mantine UI.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open the local URL printed by Vite.

Optional:

```bash
npm run build
```

This creates a production build in `dist/`.

## Deploy

This app builds as a static site and uses hash-based URLs (for example, `#/focus`) so refreshing on a nested page does not require server-side rewrite rules.

- Build command: `npm run build`
- Output directory: `dist`

### Vercel

- Framework preset: `Vite` (or `Other`)
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

Because navigation is hash-based, refreshing on routes like `#/focus`, `#/library`, or `#/settings` will not 404 on static hosting.

## Supabase setup

This app supports Supabase Auth + Postgres for login and per-user cloud sync.

1. Create a new Supabase project.
2. In Supabase Auth, enable:
   - Email/password
   - Google (optional)
3. In the Supabase SQL editor, run the schema in:

```text
supabase/schema.sql
```

4. In Supabase Project Settings, copy:
   - Project URL
   - Anon public key
5. Create a local `.env` file (not committed) with:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

When these env vars are present, the app shows a login screen and uses Supabase cloud sync by default after sign-in. If they are missing, the app falls back to local-only mode.

## Vercel env vars

When deploying to Vercel, set the same environment variables in the project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy with:

- Build command: `npm run build`
- Output directory: `dist`

## Share with a friend

To let someone else run the app on their machine:

1. Send the entire project folder (or zip it first).
2. Do not include `node_modules`.
3. They should unzip it, open a terminal in the project folder, and run:

```bash
npm install
npm run dev
```

If you want to share your current data too, export it from the app and send the JSON backup separately. Browser `localStorage` does not move with the code automatically.

## Main features

- `Today`: quick add, daily review, and backup reminders
- `Library`: grouped view and compact table view, with filters including type, search, star/review, difficulty, and date range
- `Focus`: Pomodoro timer with focus/break phases, custom durations, sound options, and live focus stats
- `Journal`: daily journal by date, optional mood, and long-form writing area
- `Stats`: entry counts plus focus-session-based time summaries
- `Settings`: data storage mode, category management, import/export, and destructive actions

## Data storage

- Data is stored in `localStorage` by default.
- The app can also use a local JSON file through the File System Access API (best in Chromium-based browsers).
- Focus sessions, journal entries, settings, and timer preferences are persisted locally.

## Import / Export

- `Quick Export` downloads a JSON backup of entries and journal data.
- `Import and Merge` merges imported data into the current dataset.
- `Import and Replace` replaces the current dataset after confirmation.

## Notes

- No backend, login, or sync service is included.
- File storage support depends on browser support for the File System Access API.
