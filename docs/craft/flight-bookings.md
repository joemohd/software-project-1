# CRAFT: Flight Bookings

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> FLT-19, FLT-21, FLT-22, FLT-23, FLT-25, FLT-26, GEN-11.
Existing DTOs: `backend/src/flight-bookings/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `flight-bookings` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement passenger validation (type derived from DOB, >=1 adult, infants <= adults), price calculation (infant 10%, extra bags), atomic seat hold for 10 minutes using a single conditional update (no overbooking), hold expiry job (Expired + release seats), confirmation after payment (unique reference, notification, e-ticket PDF), user booking lists grouped Upcoming/Past/Cancelled, and cancellation with refund from airline tiers (round-trip uses outbound tier). Include a concurrency test.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (FLT-19, FLT-21, FLT-22, FLT-23, FLT-25, FLT-26, GEN-11), prompt, how the output was used.
