# Birthday Card

Handwrite a birthday card on your iPad, share it as a link, and let them watch every stroke unfold.

- **Create** a card — pick a cover, optionally add a name. No account.
- **Write** on the inside spread with an Apple Pencil (pressure-sensitive, palm-rejected). Every stroke is recorded with timing.
- **Share** the link. The recipient sees a 3D closed card; a tap opens it and your handwriting replays at a comfortable reading pace.
- Only the device that created a card can edit it (a secret edit token lives in that browser's `localStorage`). Everyone else just views.

## Stack

Deliberately small:

| Layer   | Choice                                                                  |
| ------- | ----------------------------------------------------------------------- |
| Client  | Vite + vanilla TypeScript, CSS 3D transforms, `<canvas>` + Pointer Events |
| Server  | [Hono](https://hono.dev) — runs on Cloudflare Workers (R2) or Node ≥ 22.5 (`node:sqlite`) |
| Storage | One JSON object per card in R2, or one SQLite file in `data/`          |

No frontend framework, no ORM, two runtime dependencies.

## Develop

```sh
npm install
npm run dev        # API on :8787, Vite on :5173 (proxying /api)
```

Open `http://localhost:5173`. To test on an iPad on the same network use the LAN address Vite prints (Vite is started with `--host`).

`npm run typecheck` runs `tsc` over client, server and shared code.

## Deploy

### Cloudflare Workers (recommended — free tier covers this comfortably)

The client is served by Workers Assets; the API runs in a Worker and stores each
card as one JSON object in an R2 bucket (`worker/index.ts`, `wrangler.jsonc`).

One-time setup:

```sh
npx wrangler login                                   # or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
npx wrangler r2 bucket create birthday-card-cards    # name must match wrangler.jsonc
```

Then, every release:

```sh
npm run deploy      # vite build && wrangler deploy
```

You get `https://birthday-card.<your-subdomain>.workers.dev`; add a custom domain
under Workers → Settings → Domains & Routes. `npm run dev:cf` runs the Worker
locally with a simulated R2 bucket.

### Node (self-hosted)

```sh
npm run build      # -> dist/
npm start          # NODE_ENV=production; Hono serves dist/ + /api on $PORT (default 8787)
```

Environment: `PORT`, `DATA_DIR` (default `./data`, holds the SQLite file). Needs a
persistent disk and a TLS-terminating proxy in front (Caddy, Fly, Railway, …).

Both targets inject per-card `<title>`/OpenGraph tags into `/c/:id` responses.

## Layout

```
shared/types.ts        data model + limits, shared by client and server
server/app.ts          portable Hono app: POST /api/cards, GET/PUT /api/cards/:id (+ CardStore interface)
server/index.ts        Node entry: SQLite store, static files + SPA fallback
server/db.ts           SQLite CardStore
worker/index.ts        Cloudflare Workers entry: R2 CardStore, Workers Assets
src/main.ts            routes: /  /edit/:id  /c/:id
src/lib/ink.ts         incremental stroke renderer (used live and for replay)
src/lib/replay.ts      timeline compression + rAF playback
src/components/card3d.ts   the folding card
src/pages/*            home / editor / viewer
```

## How the replay pace works

Strokes are stored with real timestamps. On playback (`src/lib/replay.ts`) pen motion runs at `REPLAY_SPEED`× (3.2) and pauses between strokes are capped at `MAX_GAP_MS` (200 ms), so a message that took three minutes to write plays back in well under a minute while still looking like writing.

## API

| Method | Path             | Auth                  | Body / Result                                |
| ------ | ---------------- | --------------------- | -------------------------------------------- |
| POST   | `/api/cards`     | –                     | `{theme, recipient}` → `{card, editToken}`   |
| GET    | `/api/cards/:id` | –                     | `CardData`                                   |
| PUT    | `/api/cards/:id` | `Bearer <editToken>`  | `{theme?, recipient?, strokes?}` → `CardData` |

Limits live in `shared/types.ts` (`LIMITS`). There is no rate limiting — add some at the proxy if you expose this publicly.
