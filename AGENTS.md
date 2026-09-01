# Repository instructions

## Project overview

`birthday.card` is a small, framework-free TypeScript application:

- Vite serves the browser client from `src/`.
- Hono provides the shared API in `server/app.ts`.
- `worker/index.ts` runs the API on Cloudflare Workers and stores cards in R2.
- `server/index.ts` is the alternative Node/SQLite runtime.
- Shared card data and limits live in `shared/types.ts`.

Keep the client lightweight and follow the existing DOM/template style instead of introducing a frontend framework. Preserve compatibility with cards already stored in R2 when changing shared types or normalization logic.

## Working conventions

- Check `git status --short` before editing. The worktree may contain user changes; preserve them and avoid staging, reverting, or formatting unrelated files.
- Use `rg`/`rg --files` for searches and `apply_patch` for source edits.
- Put translatable interface copy in `src/lib/i18n.ts`. German is selected for `de`/`de-*`; all other browser locales use English.
- Keep the `birthday.card` wordmark and product names such as iPad and Apple Pencil unchanged. Card artwork is not UI copy; change it only when explicitly requested.
- Keep API errors safe for public clients and never expose edit tokens or deployment credentials.
- Do not commit, push, or deploy unless the user explicitly asks.

## Validation

Run these before handing off a code change:

```sh
npm run typecheck
npm run build
git diff --check
```

There is currently no separate automated test suite. Add focused tests when introducing logic that merits one; otherwise typecheck and production build are the baseline checks.

## Production deployment

Production is the Cloudflare Worker named `birthday-card`, routed to:

```text
https://birthday.card.gero.sh
```

Its R2 binding is `CARDS` and the existing bucket is `birthday-card-cards`. Do not recreate, empty, or replace the bucket during a normal deployment.

Only deploy after explicit user authorization. Deploy the exact tested and pushed commit, not whatever happens to be in a dirty worktree.

### Credentials

Cloudflare credentials are stored in the ignored root file `.dev.vars.cf`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Never print, log, commit, copy into another tracked file, or include their values in chat. Load them only into the deploy process. If the file or either variable is missing, stop and ask the user to restore authentication; do not start an OAuth flow before checking this file.

### Release procedure

1. Confirm the intended commit and remote state:

   ```sh
   git status --short
   git rev-parse HEAD
   git fetch origin
   git rev-list --left-right --count origin/main...HEAD
   ```

2. Run `npm run typecheck` and `npm run build` on the intended source.
3. Commit and push only the requested files when the user asked for a push.
4. If the worktree is clean and at the target commit, deploy with:

   ```sh
   set -a
   source ./.dev.vars.cf
   set +a
   npm run deploy
   ```

5. If unrelated uncommitted changes exist, do not stash, reset, or deploy them. Create a temporary detached Git worktree at the pushed commit, make `node_modules` available there (install or symlink the existing directory), source `.dev.vars.cf` from the original checkout, and run `npm run deploy` inside that clean worktree. Remove only that temporary worktree afterward.
6. Record the Cloudflare `Current Version ID` printed by Wrangler.
7. Verify the custom domain serves the new build. Compare the JavaScript asset name from the build/deploy output with the live HTML, for example:

   ```sh
   curl -fsS -H 'Cache-Control: no-cache' 'https://birthday.card.gero.sh/?deployment=<version-id>' \
     | rg -o 'assets/index-[A-Za-z0-9_-]+\.js'
   ```

8. Confirm `origin/main` and local `HEAD` still identify the deployed commit, and report any preserved uncommitted files separately.

`npm run deploy` runs `vite build && wrangler deploy`; a successful release must report both the custom-domain trigger and a Cloudflare version ID. A successful push alone does not update production.
