# CRAFT: Shared: Uploads, Notifications, Reports, Validation

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> GEN-01, GEN-02, GEN-05, GEN-08, GEN-09, GEN-13.
Existing DTOs: `backend/src/common/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `common` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement global ValidationPipe and consistent error filter, pagination helper (page size 10), image upload validation (JPG/PNG, 5 MB, per-entity limits, served by URL), notifications module (unread count, list, mark read, creator helper), and reports module (one report per user per item).

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (GEN-01, GEN-02, GEN-05, GEN-08, GEN-09, GEN-13), prompt, how the output was used.
