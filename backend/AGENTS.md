# AGENTS.md

## Production data: NestJS Observe

This app's production telemetry - traces, errors, logs and metrics - goes to [NestJS Observe](https://observe.nestjs.com). Until `ObserveModule` is registered in `src/app.module.ts`, nothing is sent: `npx @nestjs/observe link` sets it up in one step - it installs `@nestjs/observe`, wires it into the app, and writes the key pair (`OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`) to `.env`.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.
# AGENTS.md

Rules for any AI assistant working in this repo. Read this and `docs/SPEC.md` before writing code.

## Project
Travel Planning and Booking Platform (Software Project I, GIU, Winter 2026).
Backend: NestJS + MongoDB Atlas (Mongoose). Frontend (Milestone 2): Next.js. This folder is the backend.
M1 (backend, graded via Swagger UI): 20/11. M2 (frontend): 11/12.

## Sources of truth
1. `docs/SPEC.md` : requirements, rules, limits (copied from the official sheet)
2. `src/openapi.yaml` : expected API contract
3. `docs/craft/<module>.md` : the CRAFT prompt for the module you are working on
If code and SPEC disagree, SPEC wins. If SPEC is unclear, ask, do not guess.

## Structure
- Feature modules in `src/<module>/`: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `schemas/`, `dto/`
- Shared code in `src/common/` (guards, decorators, filters, `dto/`)
- Controllers: parse + validate + call service + return. No business logic.
- Services: business rules, DB access, transactions.

## DTO rules
- One DTO per request body or query, file name `<action>.dto.ts` in the module's `dto/`
- Use `class-validator` + `class-transformer`; add `@ApiProperty` / `@ApiPropertyOptional` for Swagger
- Query numbers need `@Type(() => Number)`
- Use shared enums/constants from `src/common/dto/`; never hardcode magic numbers
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Cross-field and DB-dependent rules (min <= max, uniqueness, ownership, overlaps) go in the service, not the DTO
- Put the requirement ID in a comment above each DTO

## Hard rules
- Auth: JWT access + refresh in httpOnly, Secure, SameSite cookies. Never localStorage/sessionStorage (ACC-19)
- Passwords: salted hash only (bcrypt). Never log or return hashes
- Enforce role + ownership on the backend for every private endpoint (ACC-11, GEN-13)
- Moderators manage only their own assigned hotel/airline
- Never store raw card data. Stripe test mode only. Confirm bookings only after the webhook verifies payment
- Holds last 10 minutes and must be atomic (no overbooking, no overlapping rooms)
- Flight times stored in UTC, entered/shown in each airport's IANA zone
- Lists are paginated, page size 10
- One platform currency for bookings; FX conversion only for itinerary budgets, via backend
- Secrets only in `.env` (never committed). Keep `.env.example` updated with names only

## Workflow
- Branch from `develop`: `feature/<REQ-ID>-<description>`; never commit to `main`
- Conventional commits with the ID: `feat(auth): ACC-01 register`
- Stay inside the task's module and files. Do not refactor or edit other modules
- Prefer small, reviewable changes
- Log every prompt that materially contributed in `AI_PROMPTS.txt` (date, student, tool, requirement ID, prompt, how output was used)
- Never paste secrets, tokens or connection strings into prompts

## Commands
- `npm run start:dev` : run API (Swagger at `/api/docs`)
- `npm run test` / `npm run test:e2e` : Vitest
- `npm run lint` / `npm run format`

