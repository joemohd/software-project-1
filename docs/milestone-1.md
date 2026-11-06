### Milestone 1: Backend & API

**Deadline: 2026-11-20**

---

Milestone 1 aims to complete the database and backend layers of the application.

By the end of this milestone, teams must:

- design and implement MongoDB schemas

- organize backend functionality into NestJS modules, controllers, services, and models

- implement authentication and authorization

- implement the required REST API

- enforce booking and inventory consistency

- implement payment, cancellation, and refund business logic

- implement itinerary, blog, and moderation logic

- provide server-side validation and error handling

- document and demonstrate APIs through Swagger UI.

A frontend is not required for Milestone 1.

Students may introduce additional endpoints when justified. Endpoint names may differ slightly, provided the API remains RESTful, consistent, documented, and capable of satisfying the official requirements. Endpoints corresponding to optional features are marked.

#### MongoDB Setup

Each team member must store the connection string in a local `.env` file:

`MONGODB_URI=<team-mongodb-atlas-connection-string>`

All team members must connect their local NestJS backend to the **same shared database**.

Teams should include an `.env.example` documenting required environment variables without exposing credentials.

#### Milestone 1 Deliverables

The backend milestone submission must contain:

- fully implemented NestJS backend

- MongoDB Atlas integration

- documented REST API using Swagger

- README with setup instructions

- updated `AI_PROMPTS.txt` 

- Git history showing team contributions.

The backend will be evaluated through Swagger UI.
