# CRAFT: Hotel Bookings and Reviews

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> HTL-16, HTL-17, HTL-18, HTL-20, HTL-21, HTL-23, GEN-11.
Existing DTOs: `backend/src/hotel-bookings/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `hotel-bookings` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement multi-room reservation as ONE atomic operation (all rooms held for 10 minutes or nothing), overlap protection against Confirmed, unexpired holds and blocked ranges, occupancy validation, price at booking time, hold expiry job, confirmation, user lists, whole-reservation cancellation with tier refund, Completed status after check-out, and create/edit/delete review with average rating recalculation.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (HTL-16, HTL-17, HTL-18, HTL-20, HTL-21, HTL-23, GEN-11), prompt, how the output was used.
