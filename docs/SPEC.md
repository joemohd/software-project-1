# SPEC.md: Travel Planning and Booking Platform

Source: official requirements sheet. Complexity: L/M/H. Deps = prerequisite IDs.
Global: page size 10 (GEN-05) · hold = 10 min · UTC storage, airport-local display (GEN-06) · backend enforces all rules (GEN-13) · single platform currency (PAY-04).

## Roles
Guest · Registered User · Admin (seeded only) · Airline Moderator · Hotel Moderator · System.

## Enums / lifecycle

| Enum / lifecycle | Transition | Trigger or condition | Requirement |
|---|---|---|---|
| **BookingStatus** | `pending payment → confirmed` | Backend verifies successful payment while the hold is valid. | FLT-23, HTL-17, PAY-01, GEN-11 |
| **BookingStatus** | `pending payment → expired` | Payment does not succeed before the 10-minute inventory hold expires; release inventory and cancel the PaymentIntent. | FLT-22, HTL-18, PAY-01, GEN-11 |
| **BookingStatus** | `confirmed → completed` | Trip or stay has concluded. Hotel completion occurs after checkout; flight completion timing is unspecified. | HTL-23, GEN-11 |
| **BookingStatus** | `confirmed → cancelled` | Eligible user or provider cancellation. Release inventory and issue any applicable refund. | FLT-06, FLT-26, HTL-21, PAY-03, GEN-11 |
| **CheckoutSessionStatus** | `open → complete` | Checkout session completes; this alone does not confirm a booking. | No direct requirement; PAY-01 requires verified PaymentIntent success. |
| **CheckoutSessionStatus** | `open → expired` | Checkout session expires. Booking expiry and inventory release are governed separately by the hold requirements. | No direct requirement; see FLT-22, HTL-18, PAY-01. |
| **CheckoutPaymentStatus** | `unpaid → paid` | Payment succeeds and is verified by the backend. Booking confirmation follows only if its hold remains valid. | PAY-01 |
| **CheckoutPaymentStatus** | `unpaid → no_payment_required` | No-payment-required outcome; no booking scenario is specified in the requirements. | Unspecified |
| **Refund status** *(inline union)* | `pending → succeeded` | Refund processing succeeds; present as **Refunded**. | PAY-03 |
| **Refund status** *(inline union)* | `pending → failed` | Refund processing fails; present as **Failed**. | PAY-03 |
| **Refund status** *(inline union)* | `pending → requires_action` | Stripe requires additional action; user-facing mapping is unspecified. | Unspecified |
| **Refund status** *(inline union)* | `pending → canceled` | Refund is cancelled; user-facing mapping is unspecified. | Unspecified |

## Functional requirements

All functional requirements can be found in `docs/functional-requirements.csv`.

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
