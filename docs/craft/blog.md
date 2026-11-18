# CRAFT: Blog, Comments, Likes, Tags

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> BLG-01 to BLG-10, BLG-12.
Existing DTOs: `backend/src/blog/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `blog` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement posts (Draft/Published), my posts, edit/delete, tags (max 5, 30 chars), comments (max 500) with edit/delete, like/unlike once per user, search ordered by likes+comments then newest, tag listing, image attach/remove, and public author page. Hidden/deactivated-author content rules from ACC-12 and GEN-10.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (BLG-01 to BLG-10, BLG-12), prompt, how the output was used.
