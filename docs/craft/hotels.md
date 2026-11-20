# CRAFT: Hotels, Rooms, Availability, Policies, Reviews (read)

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> HTL-01 to HTL-06, HTL-08 to HTL-12, HTL-15, HTL-22, HTL-24.
Existing DTOs: `backend/src/hotels/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `hotels` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement hotel profile, rooms, non-overlapping availability ranges, blocking, deactivate/delete rules, room status view, check-in/out times, cancellation tiers, hotel search (city/country, dates, guests, rooms, combined occupancy, price/rating filters, sorting), available rooms, moderator reservations list, and public reviews list. Moderators only touch their own hotel.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (HTL-01 to HTL-06, HTL-08 to HTL-12, HTL-15, HTL-22, HTL-24), prompt, how the output was used.
