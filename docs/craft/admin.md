# CRAFT: Administration

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> ACC-07a, ACC-13, ACC-14, ACC-15, ACC-16, ACC-17, GEN-07, GEN-10.
Existing DTOs: `backend/src/admin/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `admin` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement admin endpoints: create moderator linked to one provider, reset password (force change at next login), list/search/filter accounts, suspend/reactivate users and moderators, deactivate/reactivate hotel/airline with notifications, list all bookings, list/resolve reports, delete content, and write audit logs for every admin action. Admin role only.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (ACC-07a, ACC-13, ACC-14, ACC-15, ACC-16, ACC-17, GEN-07, GEN-10), prompt, how the output was used.
