## Cursor Cloud specific instructions

This is a Firebase-backed monorepo (NestJS API + Next.js web) for a DOTA2 custom game. See `README.md` for full setup/run commands.

### Project structure

| Directory | Description |
|-----------|-------------|
| `api/` | NestJS backend API (also the Firebase Functions source) |
| `web/` | Next.js frontend |
| `extensions/` | Firebase BigQuery export configs |

### Running services for development

1. **Firestore emulator** (required first): `firebase emulators:start --only firestore --project windy10v10ai`
2. **API** (needs `FIRESTORE_EMULATOR_HOST=localhost:8080`): `cd api && npm run start` or `npm run start:debug`
3. **Web**: `cd web && npm run dev`
4. All three together: `npm run start` (from root, but needs emulator data dir; without `firestore-backup/` dir, the firebase emulator still starts with an empty DB)

### Key ports

- Firestore emulator: 8080, Emulator UI: 4000
- NestJS API: 3001, Swagger docs: 3001/api-doc
- Next.js web: 3000

### Testing

- **Unit tests**: `cd api && npm run test` (51 tests, no emulator needed)
- **E2E tests**: `cd api && npm run test:e2e` (162 tests, starts its own Firestore emulator via `firebase emulators:exec`; stop any running emulator on port 8080 first)
- **Lint**: `cd api && npm run lint` and `cd web && npm run lint`

### Gotchas

- The `firestore-backup/` directory is downloaded from GCP (`gsutil`) and is not in the repo. Without it, `npm run start` emulator import flag will fail. Start the emulator without `--import` or use individual start commands.
- E2E tests manage their own emulator lifecycle via `firebase emulators:exec`; make sure no other process is using port 8080 before running them.
- The API connects to Firestore through the `FIRESTORE_EMULATOR_HOST` env var. If this is not set, it will try to connect to production Firestore (and fail without credentials).
- Java JRE is required for the Firebase Firestore emulator.
