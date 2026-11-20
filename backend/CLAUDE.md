# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project context

University team project (GIU Software Project 1): a travel planning and booking platform. Travelers book flights and hotels, plan itineraries and budgets, and write blog posts. Airline and hotel moderators manage their own providers' inventory, and admins supervise everything. The required stack is MongoDB Atlas, this NestJS REST API (`backend/`), and later a Next.js app in `../frontend/` (not created yet). The specification lives in `../docs/`:
- `../docs/project-description.md`: full spec, required repo layout and AI usage policy
- `../docs/functional-requirements.csv`: numbered requirements (ACC-01, …) with dependencies; check these before building a feature
- `../docs/milestone-1.md` (backend + Swagger, due 2026-11-20), `../docs/milestone-2.md` (frontend, due 2026-12-11)
- `../docs/erdplus-2.png`: ERD

**AI usage must be logged.** Prompts that materially shaped the work are recorded in `../AI_PROMPTS.txt` at the repo root (STUDENT / DATE / AGENT / PROMPT / RESPONSE blocks).

Branches: `main` holds stable milestone versions and `dev` is the integration branch. Features go on `feat/*` or `db/*` branches merged by PR.

## Commands (run from `backend/`)

- `npm run start:dev`: watch mode, port `PORT` or 3000
- `npm run build`: `nest build` to `dist/` (rootDir is `src`, so the output is `dist/database/...`, not `dist/src/...`)
- `npm run lint`: oxlint, type-aware (`no-floating-promises` is an error; `any` is allowed)
- `npm run format`: prettier
- `npm test`: vitest unit tests (`**/*.spec.ts`). For a single file: `npx vitest run src/app.controller.spec.ts`. For a single test: add `-t "name"`
- `npm run test:e2e`: vitest with `vitest.config.e2e.ts` (`**/*.e2e-spec.ts`). It boots the full `AppModule`, so it needs a working `MONGODB_URI`
- `npm run seed:reference-data` / `npm run seed:mock-data`: build first, then run `scripts/*.mjs` with `--env-file=.env`. The scripts import compiled schemas from `dist/`. Reference data (currencies, countries) comes from `src/database/seed/reference-data.json` and is upserted, so re-running is safe

Setup: copy `.env.example` to `.env` and set `MONGODB_URI`. The whole team shares one Atlas database, so seeds and writes affect everyone.

## Architecture

- **ESM throughout** (`"type": "module"`, `module: nodenext`). Relative imports must use the `.js` extension (`./app.module.js`). `main.ts` uses top-level `await`.
- Tests use **vitest with globals** (not Jest).
- `AppModule` loads `ConfigModule` (global) with `database.config.ts`, which exposes `database.uri`, and imports `DatabaseModule`.
- **`src/database/database.module.ts` is the single place where models are registered.** It connects through `forRootAsync`, registers every schema with `forFeature`, and exports `MongooseModule` so feature modules can inject models by importing `DatabaseModule`. A new schema has to be added to `databaseModels` there.
- **Discriminator hierarchies** (single collection, keyed by type):
  - `Expense` (`expenses`, key `expenseType`) → `Activity`, `Transport`, `Booking`
  - `Booking` (key `bookingType`) → `HotelBooking`, `FlightBooking`. These are nested discriminators, built through custom providers (`bookingSubtypeModels`) using `bookingModel.discriminator(...)`, and are exported by model token
  - `Provider` → `Airline`, `Hotel`
- Some schema files hold several entities (e.g. `expense.schema.ts` holds expenses, bookings, payments and refunds; `provider.schema.ts` holds airlines, hotels, rooms and room types; `blog-post.schema.ts` holds posts, tags and likes; `itinerary.schema.ts` holds itineraries and their clones).
- No feature modules exist yet. Only the scaffold `AppController`/`AppService` is in place. The spec requires feature-based modules (Auth, Flights, Hotels, Payments, Itineraries, Blog, Admin), each with a controller, a service and validation. `src/openapi.yaml` exists but is empty, and Swagger UI is a milestone requirement.

## Schema conventions (keep these when adding or changing schemas)

- `@Schema({ collection: '<plural_snake_case>', timestamps: true, strict: 'throw', minimize: true })`
- References are named `xxxId` / `xxxIds` (`Types.ObjectId` with `ref: Model.name`). Image arrays are named `imageUrls`.
- **Money is an integer in the smallest USD unit** (`validate: Number.isSafeInteger`). The app currency is USD, and currency codes are lowercase ISO-4217.
- Store time zone information with dates.
- Payments and refunds mirror Stripe objects (`stripeCheckoutSessionId`, `paymentIntentId`, Stripe status enums).
- Field names are persisted, so renaming one means migrating existing documents in the shared database.
- Many rules are deliberately left to the service layer and marked `// TODO` in the schemas: referential integrity, ownership checks, booking state transitions, preventing overlapping or concurrent room bookings, and argon2 password hashing. Implement these in services rather than in the schemas.
