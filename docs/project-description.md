<div style="display: flex; gap: 20px;">
  <div style="flex: 1;">
    <b>German International University<br>Faculty of Informatics and Computer Science</b><br>© Winter 2026 Dr. Nada Sharaf
  </div>
  <div style="flex: 1; text-align: right;">
    <b>Software Project 1<br>Project Description<br>Travel Planning and Booking Platform</b>
  </div>
</div>

---

### Project Overview

The goal of this project is to design, code and test a web-based travel planning and booking platform.

The platform serves multiple types of users:

- **Travelers** can search for flights and hotels, make and manage bookings, construct day-by-day itineraries, calculate trip budgets, publish itineraries, and share travel experiences through blog posts.

- **Airline and hotel moderators** manage the inventory and policies of their assigned providers.

- **Administrators** supervise accounts, moderators, bookings and community content.

The final application must demonstrate a well-designed data model, role-based authorization, ownership restrictions, consistent booking and availability information, and integration between the backend and frontend.

---

The project must follow the **Model–View–Controller (MVC)** architectural pattern using the following technologies:

- **Model:** **MongoDB Atlas** stores the application data. **NestJS** schemas represent database entities, while services implement business logic, validation and database operations.

- **View:** **Next.js** provides the frontend application, including public pages, booking workflows, itinerary editors, and role-specific dashboards. 

- **Controller:** **NestJS** controllers receive HTTP requests, validate incoming data through the application’s validation mechanisms, invoke the appropriate services, and return REST API responses. 

Backend functionality must be organized into feature-based modules, such as Authentication, Flights, Hotels, Payments, Itineraries, Blog, and Administration.

### Project Objectives

By completing this project, students should demonstrate their ability to: 

- analyze requirements and translate them into an MVC-based full-stack application

- design appropriate MongoDB schemas and model relationships between domain entities

- design and implement RESTful APIs using NestJS

- implement authentication, authorization, ownership checks, and role-based access control

- implement searching, filtering, sorting, pagination, and server-side validation

- handle booking availability, inventory holds, and concurrency-sensitive operations

- implement provider policies, payments, cancellations, and refunds

- integrate booking functionality with itinerary planning and budgeting

- develop responsive frontend interfaces using Next.js

- implement community and moderation functionality

- collaborate using a professional Git/GitHub workflow.

### Requirements and User Stories

The mandatory functional requirements are provided in `functional-requirements.csv`.

Each requirement has a unique identifier, such as `ACC-01` , `FLT-11` , `HTL-16` , `PAY-01` , `ITN-21` , and `BLG-01` . These identifiers should be referenced in relevant GitHub issues, pull requests, commit messages, and API documentation to maintain traceability. 

### System Actors

The following table outlines the system actors and their roles and responsibilities.

|Actor|Role and responsibilities|
|---|---|
|**Guest**|An unauthenticated visitor who may search flights and hotels, inspect available options, and browse public blog posts and itineraries. Restricted actions require authentication.|
|**Registered user**|A traveler who manages a profile, books flights and hotels, manages bookings,creates itineraries and budgets, publishes or clones public itineraries, creates blog posts, comments, likes, submits eligible hotel reviews, and reports inappropriate content.|
|**Administrator**|Manages platform accounts, creates moderator accounts, suspends and reactivates users and moderators, inspects bookings, handles reports, moderates content, and reviews audit logs.|
|**Airline moderator**|Manages exactly one assigned airline, including its profile, flights, cabin inventory, prices, baggage rules, cancellation policies, and booking information.|
|**Hotel moderator**|Manages exactly one assigned hotel, including its profile, rooms, availability, prices, policies, and reservations.|
|**System**|Handles payment confirmation, inventory-hold expiry, notifications, exchange rate retrieval, booking-state updates, and audit logging.|

### Database Entities

The following table outlines the core database entities that should be represented in the application. You may add supporting entities where suitable or necessary.

| Domain|Core entities|Key relationships and responsibilities|
|---|---|---|
| **Accounts and roles** | User Account, Moderator Assignment | User accounts manage authentication, profiles, roles, preferences, and account status. Moderator assignments associate moderators with a specific provider and limit their management scope. |
| **Flights** | Airline, Airport, Flight, Cabin Inventory, Airline Policy | An airline operates flights between departure and arrival airports. Each flight has cabin inventory, pricing, status, and applicable airline policies. |
| **Flight bookings** | Flight Booking, Passenger | A booking belongs to a user and contains one or more selected flights and passengers. It records baggage, agreed prices, booking references, payment information, and booking status. |
| **Hotels** | Hotel, Room, Room Availability, Hotel Policy | A hotel contains bookable rooms. Rooms have occupancy and pricing information, while availability records available or blocked dates. Hotel policies define applicable booking and stay rules. |
| **Hotel bookings** | Hotel Booking, Review | A hotel booking belongs to a user and references a room and stay dates. It records booking and payment status. Completed eligible bookings may receive reviews. |
| **Payments** | Payment, Refund | Payments and refunds are associated with bookings and record amounts, transaction identifiers, status, timestamps, and applicable policies. |
| **Itineraries** | Itinerary, Itinerary Day, Activity, Budget Entry, Transport Cost, Exchange Rate | An itinerary contains ordered days, destinations, activities, budget entries, and transport costs. Publicly cloned itineraries preserve attribution to the original itinerary. |
| **Community** | Blog Post, Comment, Like, Tag | Blog posts belong to authors and support draft/published states, comments, likes, searchable tags, and associated media.|

The data for countries, cities, airports and tourist attractions must be initialised using

- `mock-data/airports-data.csv`

- `mock-data/tourist-attractions-data.csv`

- `mock-data/cities-data.csv`

- `mock-data/countries-data.csv`.

### Summary of Functional Requirements

#### 1 Accounts and Administration

The system must support user registration, authentication, logout, password changes, profile management, and account deactivation according to the requirements. 

Account email addresses must be unique. Authentication must enforce the required password rules, failedlogin lockout, session expiry, and account status. 

Role-based authorization is mandatory. Users must not access another user’s private bookings or itineraries. 

Airline and hotel moderators may manage only their assigned provider. 

Administrators create moderator accounts, manage account status, inspect platform bookings, and moderate reported content. 

Administrator accounts must be seeded; administrator self-registration is not permitted. 

Users' passwords can be reset by:

- admin assistance

- email-based verification.

#### 2 Flights

Airline moderators manage airline profiles, flights, cabin categories, prices, baggage allowances, extrabaggage rules, cancellation policies, schedule modifications, and flight cancellations.

Guests and registered users can search for one-way and round-trip flights by route, travel dates, passenger types/counts, and cabin class.

Search results must support the required filtering and sorting options.

Registered users enter passenger and baggage details, review the booking summary, accept applicable policies, and proceed to payment.

Flight inventory must be protected through concurrency-safe temporary holds. Holds expire after the period specified in the requirements sheet, releasing unused inventory.

After successful payment verification, the booking becomes confirmed and receives a unique reference and e-ticket.

Users can inspect their bookings and cancel eligible reservations according to airline policies.

Users are allowed to change their flight booking and seat selection.

#### 3 Hotels

Hotel moderators manage hotel profiles, individually bookable rooms, availability, pricing, blocked dates, check-in/check-out times, cancellation policies, and reservations.

Guests and registered users search hotels by destination, dates, and guest count, with filtering and sorting. Registered users can inspect available rooms, select one or more rooms in the same hotel, review the total price and policies, and proceed to payment.

The backend must protect room inventory against concurrent reservations and overlapping bookings.

When multiple rooms are selected, the reservation must be handled consistently as one operation. Users can inspect and cancel eligible reservations.

After a completed stay, users may submit reviews according to the eligibility rules in the requirements sheet.

Hotel moderators are allowed to reply to reviews.

#### 4 Payments and Refunds

Flight and hotel payments must use Stripe test mode.

The backend must verify payment outcomes before confirming bookings.

Provider policies must be displayed and accepted before payment, and acceptance must be recorded. Failed or expired payments must leave bookings unconfirmed and release inventory when required. Cancellation and refund calculations must follow the policy applicable to the booking. Users must be able to inspect payment and refund status.

The application must not store raw card information.

#### 5 Itinerary Planning and Budgeting

Registered users create itineraries containing titles, countries, start dates, ordered days, cities, activities, images, and budget entries.

Itinerary dates are derived from the start date and the order of days.

Adding, deleting, or reordering days must update day numbering, dates, city grouping, and budget calculations consistently.

Budget entries cover food, accommodation, local transportation, and activities, with separate intercity transportation costs.

Budget totals must support currency conversion using exchange rates retrieved from FXRatesAPI. Students must integrate FXRatesAPI through the NestJS backend to retrieve exchange rates and convert itinerary budget amounts into the user’s selected display currency.

The system must handle invalid currency codes, unavailable exchange rates, and API request failures. API credentials, if required, must be stored securely and must not be exposed to the frontend.

Itineraries may be public or private. Private itineraries are accessible only to their owners.

Public itineraries can be searched and viewed by others. A registered user may clone a public itinerary into an independent private copy that preserves attribution.

Flight and hotel searches must be reusable from the itinerary context where required.

Users can attach confirmed bookings to itineraries.

Itineraries can be exported into PDFs.

#### 6 Blog and Community

Registered users can create blog posts in Draft or Published status.

Published posts are publicly accessible and support searching, tags, author pages, comments, and likes. Authors may edit or delete their own posts. Users may manage their own comments.

A user may like a particular post at most once.

Users may report supported content. Administrators review reports and may dismiss them, hide content, or delete inappropriate content.

Important moderation actions must be auditable.

#### 7 Shared System Behavior

The platform must implement:

- server-side validation and consistent error responses

- filtering, sorting, and pagination

- appropriate image-upload validation

- mandatory in-app notifications

- administrative audit logging

- correct handling of airport time zones

- confirmation before destructive actions

- meaningful loading, error, and empty states.

### Development Milestones

The project is divided into **two major milestones** . Each milestone must produce a demonstrable, reviewable version of the application.

#### Milestone 1: Backend & API - Deadline ( 20/11)

Milestone 1 focuses on the **NestJS backend and MongoDB data layer**.

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

#### Milestone 2: Frontend & Integration - Deadline ( 11/12)

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

**Frontend validation and route protection must not replace backend validation and authorization.**

---

Deploying the complete application to any cloud-based platform is considered an **optional bonus** . To qualify for this bonus, students must deploy both the frontend and backend and ensure that the application is fully functional in the deployed environment. 

**Important:** Teams applying for this bonus will be evaluated exclusively on the **deployed version** of their application. The locally running version will not be considered when evaluating the deployment bonus. 

### Git and GitHub Development Workflow

All teams must use GitHub throughout development.

Uploading the entire project only at the end of the semester is not acceptable.

#### Repository Structure

A recommended repository structure is: 

```
project-root/
|
|-- backend/
|-- frontend/
|-- docs/ 
|   |-- requirements/
|   |-- api/
|
|-- AI_PROMPTS.txt
|-- README.md`
|--.gitignore
```

#### `main` and `develop` Branches

The repository should contain two long-lived branches:

- **`main`:** stable milestone/release versions

- **`develop`:** integration branch for completed work throughout each milestone.

Students must not develop features directly on `main`.

#### Feature Branches

New work must be implemented on short-lived branches created from the latest `develop` branch. The naming convention is:

- **`feat/<requirement(s)>`:** used when coding a new feature (or set of features) depending on the API endpoints assigned to the team member

- **`fix/<requirement(s)>`:** used when changing features

- **`docs/<short description>`:** used when adding or changing documentation.

Each feature branch should contain a coherent unit of work.

Each commit should have a precise and concise message. Avoid vague messages.

#### Pull Request Regulations

Each pull request should:

- have a meaningful title and description

- reference relevant requirement IDs

- contain only related changes

- avoid committing secrets or environment files

- be reviewed by the team leader

- resolve important review comments before merging.

#### Merge Conflicts and Collaboration

Students must regularly synchronize their branches with `develop`.

Merge conflicts must be resolved carefully. The team leader is responsible for verifying that conflict resolution does not remove another team member’s work.

Git history must demonstrate meaningful contributions throughout the project.

### AI Usage Policy

Generative AI tools are **allowed** in this project. AI tools may be used for:

- explaining concepts

- brainstorming implementation approaches

- generating or reviewing code

- debugging and refactoring

- improving documentation.

However, AI usage must be **transparent and documented** . 

Each repository must contain `AI_PROMPTS.txt`. Students must record prompts that materially contributed to the submitted project. A recommended entry format is: 

```
================================================
DATE: 2026-10-04
STUDENT: <student name>
================================================
PROMPT

<student's prompt>
================================================
RESPONSE

<AI agent's response>
================================================
```

- Students are responsible for all submitted code, including AI-generated code.

- Students must understand and explain their implementation during project discussions.

- c) AI-generated output must be reviewed before integration.

- Sensitive information, passwords, tokens, and credentials must not be shared with AI tools.

- The prompt log must be maintained throughout development.

- Failure to disclose substantial AI-assisted work may violate submission regulations.

---

### Tasks

**Milestone 1**

- [ ] Extract user stories from the functional requirements.

- [ ] Draw use-case diagrams using the user stories and funcyional requirements.

- [ ] Draw flow charts for each use case.

- [ ] Draw the entity-relationship diagram.

- [ ] Provide testable conditions for each user story in the form of given... when... then...

