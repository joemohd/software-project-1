### Milestone 2: Frontend & Integration

**Deadline: 2026-12-11**

---

Milestone 2 focuses on implementing the **Next.js frontend** and integrating it with the completed backend.

The frontend must provide:

- responsive public and authenticated pages

- registration, login, and profile management

- flight and hotel search and booking workflows

- payment and cancellation interfaces

- itinerary creation, editing, budgeting, and sharing

- blog and community interfaces

- airline and hotel moderator dashboards

- administrator management and moderation interfaces

- appropriate loading, error, and confirmation states.

**Frontend validation and route protection does not replace backend validation and authorization.**

#### Next.js Rendering Requirements

Students are expected to understand that different pages have different rendering requirements.

The entire application should not use a single rendering strategy.

The following table provides recommended approaches.

|Page / Feature|Suggested Strategy|
|---|---|
|Published Blog Post|ISR / Static Rendering|
|Blog Listing / Search|Dynamic SSR|
|Public Author Page|ISR / Static Rendering|
|Blog Editor / Drafts|Dynamic SSR + Client Components|
|Likes and Comments|Client Components|
|Public Itinerary Detail|ISR / Static Rendering|
|Public Itinerary Search|Dynamic SSR|
|Private Itinerary Detail|Dynamic SSR|
|Itinerary Editor|Dynamic SSR + Client Components|
|User Booking Pages|Dynamic SSR|
|Flight / Hotel Search|Dynamic SSR|
|Admin / Moderator Dashboards|Dynamic SSR|

Students must justify their rendering decisions during evaluation.

In the Next.js App Router, Client Components should be introduced where browser-side interactivity is required.

Public pages should include appropriate metadata for SEO where applicable. 

#### Milestone 2 Deliverables

The final milestone submission must contain:

- complete Next.js frontend

- integrated backend and frontend

- working mandatory workflows for all roles

- final README and setup instructions

- updated `AI_PROMPTS.txt`

- complete GitHub contribution history.
