# CRAFT: Airlines, Flights, Cabins, Policies

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> FLT-01 to FLT-06, FLT-08, FLT-09, FLT-11, FLT-12, FLT-15, FLT-17, FLT-29, FLT-30, GEN-06.
Existing DTOs: `backend/src/flights/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `flights` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement airline profile, airports list, flight CRUD with local-time-to-UTC conversion using the airport IANA zone, cabins, baggage policy, cancellation tiers, flight edit rules, flight cancel (100% refund trigger, release holds, notify), search (one-way/round-trip, passengers, cabin filter, price filter, sorting, available = total - booked - held), flight details, moderator booking list + CSV export, and a job that marks flights Departed. Moderators only touch their own airline.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (FLT-01 to FLT-06, FLT-08, FLT-09, FLT-11, FLT-12, FLT-15, FLT-17, FLT-29, FLT-30, GEN-06), prompt, how the output was used.
