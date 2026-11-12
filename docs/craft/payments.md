# CRAFT: Payments, Refunds, Policy Acceptance

**C (Context):**
NestJS + MongoDB (Mongoose) backend for a travel booking platform. Follow `backend/AGENTS.md`.
Requirements: `docs/SPEC.md` -> PAY-01, PAY-02, PAY-03, PAY-04.
Existing DTOs: `backend/src/payments/dto/`. API contract: `backend/src/openapi.yaml`.
Only touch the `payments` module (plus registering it in `app.module.ts`).

**R (Role):**
Senior NestJS/TypeScript backend engineer who writes secure, validated, well-documented code.

**A (Action):**
Implement policy retrieval and acceptance (timestamp stored), Stripe test-mode PaymentIntent creation (blocked until policies accepted and while hold is valid), retry, payment status, webhook with signature verification that confirms the booking (calls flight/hotel confirm), PaymentIntent cancellation on hold expiry, refunds via Stripe Refunds API with status Pending/Refunded/Failed, and notifications. Store only Stripe payment ID, amount, currency, status.

**F (Format):**
- Output complete files with their paths, one code block per file
- Order: schemas -> DTO changes (if any) -> service -> controller -> module -> tests
- Swagger decorators on every endpoint; requirement ID in comments
- Business-rule errors use proper HTTP exceptions (400, 401, 403, 404, 409)
- Short explanation (max 5 bullets) after the code

**T (Target):**
University project graded through Swagger UI by TAs. Code must be readable and explainable by the student, and follow the Git rules in AGENTS.md.

---
Log in `AI_PROMPTS.txt`: date, student, tool, requirement IDs (PAY-01, PAY-02, PAY-03, PAY-04), prompt, how the output was used.
