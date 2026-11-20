# CRAFT: Itineraries, Budgets, Currency Conversion

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> ITN-01, ITN-03, ITN-05, ITN-07 to ITN-10, ITN-12, ITN-14, ITN-16, ITN-18, ITN-20, ITN-21, ITN-25, ITN-26.
Existing DTOs: `backend/src/itineraries/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `itineraries` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement itinerary CRUD with ownership checks, days (max 60, sequential numbering, dates from start date, delete and reorder recalculation, same-city grouping), activities and images, budget entries and transport costs, budget summary by category/day/group, FXRatesAPI integration from the backend (daily cache in DB, fallback to last cached, invalid currency handling, key only in env), public/private visibility, public search, clone with attribution, and hotel/flight search reuse for a city group.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (ITN-01, ITN-03, ITN-05, ITN-07 to ITN-10, ITN-12, ITN-14, ITN-16, ITN-18, ITN-20, ITN-21, ITN-25, ITN-26), prompt, how the output was used.
