# CRAFT: Auth, Users

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> ACC-01, ACC-04, ACC-05, ACC-06, ACC-08, ACC-09, ACC-11, ACC-12, ACC-18, ACC-19.
Existing DTOs: `backend/src/auth/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `auth` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement registration, login with 5-fail/15-min lockout, logout with refresh-token revocation, 30-min inactivity expiry, change password, GET /auth/me, profile update and self-deactivation. JWT in httpOnly+Secure+SameSite cookies, bcrypt hashing, roles guard, ownership guard, seed script for admin accounts. Also seed countries, cities, airports, currencies (GEN-12).

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (ACC-01, ACC-04, ACC-05, ACC-06, ACC-08, ACC-09, ACC-11, ACC-12, ACC-18, ACC-19), prompt, how the output was used.
