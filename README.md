# History Timeline · خط الزمن

Explore all of history on one zoomable timeline: drag through time, zoom from eras to single years, and read the full story of any event. English and Arabic.

Stack: Next.js 16 (App Router, TypeScript, Cache Components), Tailwind CSS 4, Supabase Postgres, Vercel.

## What is in step 1

- **Timeline** (`src/components/timeline`): drag, pinch, scroll and keyboard zoom from eras to single years, fixed center playhead, era chips, "Around <year>" list, topic focus. The math is pure and tested (`src/lib/timeline/geometry.ts`).
- **Search** (`src/lib/search`): keywords with typo tolerance over years ("44 BC", "٤٤ ق.م"), eras, topics and events, in English and Arabic. Runs in the browser over data the page already has.
- **Event pages** (`/[locale]/events/[slug]`): the full story layout (key dates, chapters, sides, key people, related events) for events that have a story, and a short layout for the rest.
- **Images** load straight from Wikimedia Commons thumbnails (no storage or optimizer cost) with author and license credit. Non-free files are refused.
- **Database** (`supabase/migrations`): events, topics, eras, images, sources and stories, plus tables for accounts, premium, schools, favorites and contributions (later steps). Row Level Security only lets the public see published content.
- **Languages**: `/en` and `/ar` (right to left). Era and topic names are in Arabic; event text falls back to English until step 3, and pages say so.
- **Themes**: light, dark or system, with no flash on load. Installable on phones (web manifest).
- **Logging**: every call to an external service (database, Wikimedia) is logged as one JSON line with operation, target, duration and outcome (`src/lib/log/logger.ts`).

## Run it locally

Requirements: Node 22+, PostgreSQL 16 (`psql` on your PATH).

```bash
npm install
cp .env.example .env.local          # DATABASE_URL for your local Postgres
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/history_timeline
npm run db:reset                    # creates the database: Supabase shim + migrations + seed
npm run dev                         # http://localhost:3000
```

`db:reset` refuses to touch a hosted Supabase database.

## Tests

```bash
npm run lint && npm run format:check && npm run typecheck
npm test                 # unit + database tests (database tests need DATABASE_URL and npm run db:reset)
npm run build
npm run test:e2e         # browser tests (desktop and phone) against the production build
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request with a fresh Postgres 16.

## Put it live (Supabase + Vercel)

1. **Create the database.** In [Supabase](https://supabase.com/dashboard), create a project (pick a region near your users, e.g. Frankfurt or Mumbai for the Gulf). In **SQL Editor**, run each file in `supabase/migrations/` in name order, then run `supabase/seed.sql`. (With the Supabase CLI instead: `supabase link` then `supabase db push`, then run `seed.sql`.) Do **not** run anything in `supabase/local/`; that is only for local testing.
2. **Copy the connection string.** In Supabase, click **Connect**, choose **Transaction pooler**, and copy the URI (port 6543). Put your database password in it and add `?sslmode=require` at the end.
3. **Create the Vercel project.** In [Vercel](https://vercel.com/new), import `Top965/history-timeline`. Framework: Next.js (detected).
4. **Add environment variables** in Vercel (Project Settings > Environment Variables), for Production and Preview:
   - `DATABASE_URL` = the string from step 2
   - `NEXT_PUBLIC_SITE_URL` = your site address, e.g. `https://historytimeline.app` (optional until you have a domain)
5. **Deploy.** Pages are built ahead of time from the database and refreshed hourly. Check `https://<your-site>/api/health` returns `{"status":"ok"}`.

The site only ever reads, inside read-only transactions as Supabase's `anon` role, so Row Level Security decides what is public.

## Adding Commons images

```bash
DATABASE_URL=<writable connection string> npx tsx scripts/commons/attach-image.ts \
  --event great-pyramid-of-giza --file "File:Kheops-Pyramid.jpg" --caption "The Great Pyramid of Giza"
```

The script reads the file's license and author from the Commons API, refuses non-free files, and stores the credit. Step 2 automates this for all events.

## Changing seed content

Edit `supabase/seed-data/content.json`, then `npm run db:seed:build` to regenerate `supabase/seed.sql` (CI checks it is up to date). The seed is idempotent and can be re-run.

## Project layout

```
src/app/[locale]/            pages (root layout per language)
src/app/api/health/          uptime check
src/components/timeline/     timeline, search box
src/components/story/        event pages, Commons figure
src/lib/db/                  database client and queries (cached with "use cache")
src/lib/search/              keyword search
src/lib/timeline/            timeline math
src/lib/i18n/                languages and UI text
supabase/migrations/         database schema and security
supabase/seed-data/          prototype content (source of seed.sql)
scripts/                     seed builder, Commons import, icon renderer
docs/prototype/              the approved prototype, for reference
tests/                       unit, database and browser tests
```

## Credits

Event data from Wikidata (CC0). Story text adapted from Wikipedia (CC BY-SA 4.0). Images from Wikimedia Commons under their individual licenses, credited on each image.
