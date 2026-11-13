# SPEC.md: Travel Planning and Booking Platform

Source: official requirements sheet. Complexity: L/M/H. Deps = prerequisite IDs.
Global: page size 10 (GEN-05) · hold = 10 min · UTC storage, airport-local display (GEN-06) · backend enforces all rules (GEN-13) · single platform currency (PAY-04).

## Roles
Guest · Registered User · Admin (seeded only) · Airline Moderator (1 airline) · Hotel Moderator (1 hotel) · System.

## Enums / lifecycle
- Booking status (GEN-11): Pending Payment -> Confirmed -> Completed; Pending Payment -> Expired (timeout); Confirmed -> Cancelled. Nothing else.
- Flight status (FLT-30): Scheduled | Cancelled | Departed. Only Scheduled is searchable, editable, bookable.
- Cabins: Economy, Premium Economy, Business, First. Passenger: adult 12+, child 2-11, infant <2.

---
## 1. Accounts and Administration (module: auth, users, admin)
| ID | Rule | Endpoint | L/M/H | Deps |
|---|---|---|---|---|
| ACC-01 | Register: name, unique email, password (>=8, >=1 letter, >=1 digit), consent=true. Reject invalid/duplicate email, weak password, no consent | POST /api/auth/register | L | - |
| ACC-04 | Login (user/admin/moderator) with email+password -> role home. Generic "invalid email or password". Suspended -> "account suspended" | POST /api/auth/login | M | ACC-01 |
| ACC-05 | 5 consecutive failed logins -> lock 15 min + lockout message. Success resets counter | login | M | ACC-04 |
| ACC-06 | Logout clears cookies + revokes refresh token. 30 min inactivity -> session expires | POST /api/auth/logout | M | ACC-04, ACC-19 |
| ACC-07a | Admin resets user/moderator password to temporary; must change at next login | POST /api/admin/users/:id/reset-password | L | ACC-04, ACC-14 |
| ACC-08 | Change password: current + new (meets rules) | PATCH /api/auth/change-password | L | ACC-04 |
| ACC-09 | Edit name, phone, preferred currency; save only if all valid | PATCH /api/users/me | L | ACC-04 |
| ACC-10 | Guest doing restricted action (book, review, post) -> login, then return to action (frontend flow; backend returns 401) | - | M | ACC-04 |
| ACC-11 | Bookings and private itineraries owner-only. Admin sees all bookings; moderators see own provider's. Else 403/404 | GET /api/users/me, guards | M | ACC-04 |
| ACC-12 | Deactivate own account after confirmation; blocked if upcoming Confirmed bookings. Deactivated cannot log in; posts + public itineraries hidden; comments/reviews show "Deleted user" | DELETE /api/users/me | M | ACC-04, GEN-11 |
| ACC-13 | Admin creates hotel/airline moderator (name, email, role) linked to exactly one provider, temp password; must change on first login | POST /api/admin/moderators | M | ACC-04, FLT-01, HTL-01 |
| ACC-14 | Admin lists accounts (name, email, role, status, reg date), search name/email, filter role/status, paginated | GET /api/admin/accounts | L | ACC-04 |
| ACC-15 | Admin suspends/reactivates moderator; separately deactivates/reactivates hotel/airline (hidden from search, not bookable, Confirmed bookings stay valid). In-app notification to affected | PATCH /api/admin/accounts/:id/suspend, /reactivate; PATCH /api/admin/providers/:type/:id/deactivate, /reactivate | M | ACC-13, GEN-01 |
| ACC-16 | Admin suspends/reactivates users: cannot log in, bookings stay valid, content stays visible unless hidden (GEN-10) | same suspend/reactivate | L | ACC-14 |
| ACC-17 | Admin read-only list of all flight+hotel bookings (reference, user, provider, dates, amount, status), filter type/status/date range | GET /api/admin/bookings | L | FLT-23, HTL-17 |
| ACC-18 | Admin accounts created by seeding only; no self-registration | seed script | L | ACC-04 |
| ACC-19 | No tokens in localStorage/sessionStorage. Access+refresh as httpOnly, Secure, SameSite cookies. Frontend gets user from /auth/me | GET /api/auth/me | M | ACC-04, ACC-06 |

## 2. Flights (module: flights, flight-bookings)
| ID | Rule | Endpoint | L/M/H | Deps |
|---|---|---|---|---|
| FLT-01 | Admin creates airline; airline moderator edits own airline (name, code, logo) | POST/GET/PATCH /api/airlines(/:id) | L | GEN-08 |
| FLT-02 | Read-only airport list (IATA, name, city, country, IANA zone) loaded at setup. Flights and search accept only these | GET /api/airports | L | GEN-12 |
| FLT-03 | Moderator creates flight: number, dep/arr airports, dep/arr times entered in each airport's local time, stored UTC. Reject: same airports, arrival not after departure (UTC), departure in past, duplicate number for same airline on same departure date | POST /api/flights | M | FLT-01, FLT-02 |
| FLT-04 | Cabins per flight from fixed set, each once per flight: seats int>0, price>0, free bags, max kg/bag | POST /api/flights/:id/cabins, PATCH .../cabins/:cabinId | M | FLT-03 |
| FLT-05 | Moderator edits times, cabin prices, seats of own Scheduled flights. Airports locked once booked. Seats not below booked+held. Price change does not affect existing bookings. Time change notifies Confirmed passengers | PATCH /api/flights/:id | M | FLT-03, FLT-04, GEN-01, FLT-30 |
| FLT-06 | Moderator cancels Scheduled flight after confirmation: becomes Cancelled, hidden; all Confirmed bookings -> Cancelled with 100% refund; holds released; notify passengers | POST /api/flights/:id/cancel | M | FLT-23, PAY-03, GEN-01, FLT-30 |
| FLT-08 | Extra bag price >0, max extra bags per passenger >=0; extra bag weight = cabin max | PUT /api/airlines/:id/baggage-policy | L | FLT-04 |
| FLT-09 | Cancellation tiers: unique days-before-departure (int>=0) + refund % (0-100). Use tier with highest threshold not exceeding days remaining; none -> 0% | PUT /api/airlines/:id/cancellation-policy | M | FLT-01 |
| FLT-11 | Search by dep airport, arr airport, local dep date, passenger count. List Scheduled flights of active airlines with enough seats (total - booked - held). Pick flight+cabin. Else "no flights found" | GET /api/flights/search | **H** | FLT-02, 03, 04, 22 |
| FLT-12 | (a) Round-trip: outbound+return, ONE booking, two segments, one payment, one reference, cancelled as whole using outbound tier. (b) Adult/child pay cabin fare + seat; infant pays 10%, no seat; >=1 adult; infants <= adults; type validated vs DOB. (c) optional cabin filter | search + booking | **H** | FLT-11, FLT-19 |
| FLT-15 | Price min/max filter (inclusive, keep other criteria); error if min>max; sort by price, duration, departure time | search | M | FLT-11 |
| FLT-17 | Flight details: airline, number, airports, local times, duration, each cabin (price, seats left, baggage), airline cancellation policy | GET /api/flights/:id | L | FLT-11 |
| FLT-19 | Per passenger: full name, DOB, passport/ID; optional extra bags (bags, weight) up to airline max; fee added to total | POST /api/flight-bookings | M | FLT-11, FLT-08 |
| FLT-21 | Booking summary (flight, passengers, baggage, total) before payment | POST /api/flight-bookings | L | FLT-19 |
| FLT-22 | On proceed to payment: atomically reserve seats only if enough remain; booking Pending Payment held 10 min; unpaid -> Expired, seats released. Concurrency never overbooks | POST /api/flight-bookings/hold | **H** | FLT-11, GEN-11 |
| FLT-23 | After payment: Confirmed, held -> booked seats, unique reference, confirmation, in-app notification, e-ticket PDF | GET /api/flight-bookings/:id/e-ticket | M | FLT-21, 22, PAY-01, 02, GEN-01 |
| FLT-25 | User lists bookings grouped Upcoming/Past/Cancelled (reference, flight, date, passengers, cabin, status), open details | GET /api/flight-bookings(/:id) | L | FLT-23 |
| FLT-26 | User cancels own Confirmed booking any time before departure after seeing refund (FLT-09 tiers). Cancelled, seats returned, refund created. After departure blocked | POST /api/flight-bookings/:id/cancel | M | FLT-23, FLT-09, PAY-03 |
| FLT-29 | Moderator views per-flight bookings (reference, names, cabin, seats, status), seats remaining per cabin, passenger list CSV export | GET /api/flights/:id/bookings, /passengers/export | L | FLT-23 |
| FLT-30 | Flight becomes Departed once departure passed | system job | L | FLT-03 |

## 3. Hotels (module: hotels, hotel-bookings)
| ID | Rule | Endpoint | L/M/H | Deps |
|---|---|---|---|---|
| HTL-01 | Admin creates hotel; hotel moderator edits own (name, address, city, country, description, photos, star class, amenities) | POST/PATCH /api/hotels(/:id) | L | GEN-08, GEN-12 |
| HTL-02 | Hotel page: profile, photos, amenities, check-in/out times, cancellation policy, avg rating + reviews, available rooms when dates given | GET /api/hotels/:id | L | HTL-01 |
| HTL-03 | Add room (individually bookable): number/name unique in hotel, type, beds, max occupancy >=1, price/night >0 | POST /api/hotels/:id/rooms | L | HTL-01 |
| HTL-04 | Define non-overlapping bookable date ranges per room | POST .../rooms/:roomId/availability | M | HTL-03 |
| HTL-05 | Edit beds, occupancy, price, availability. Price change does not affect existing reservations. Cannot remove availability for confirmed dates | PATCH .../rooms/:roomId, .../availability | M | HTL-03 |
| HTL-06 | Block date ranges, deactivate or delete room. Rejected if overlaps Confirmed or Pending Payment. Deactivated excluded from search. Delete only if never reserved | PATCH .../availability, DELETE .../rooms/:roomId | M | HTL-04, 03 |
| HTL-08 | Room status for chosen range: Available, Booked (with reference), Blocked | GET /api/hotels/:id/availability | M | HTL-04 |
| HTL-09 | Set standard check-in/out times, shown on hotel page + booking summary | PUT /api/hotels/:id/policies | L | HTL-01 |
| HTL-10 | Cancellation tiers: unique days-before-check-in (>=0) + refund % (0-100), same rule as FLT-09 | PUT /api/hotels/:id/policies | M | HTL-01 |
| HTL-11 | Search by city or country, check-in, check-out, guests, rooms (default 1). List active hotels with at least that many rooms free for whole stay and combined max occupancy >= guests. Check-out > check-in; check-in not in past | GET /api/hotels/search | **H** | HTL-03, 04, 06, 18 |
| HTL-12 | Filter by min/max price per night (cheapest qualifying room), min avg rating 1-5 (unrated excluded); sort by price or rating | search | M | HTL-11, HTL-23 |
| HTL-15 | View all free rooms for dates: type, beds, occupancy, price/night, total stay price; select one or more | GET /api/hotels/:id/rooms/available | M | HTL-11 |
| HTL-16 | Book >=1 rooms of same hotel, same dates, one reservation; adults+children (0-17) per room, >=1 adult overall, never exceed room max occupancy. Total = sum(nights x room price at booking time) | POST /api/hotel-bookings | **H** | HTL-11, 03, 15 |
| HTL-17 | After payment: all rooms Confirmed, unique reference, confirmation page, in-app notification | webhook flow | M | HTL-16, PAY-01, 02, GEN-01 |
| HTL-18 | On proceed to payment: hold all rooms together 10 min as ONE Pending Payment reservation. Any overlap (Confirmed, unexpired hold, blocked) -> reject whole request, hold nothing. Unpaid -> Expired, rooms released | POST /api/hotel-bookings | **H** | HTL-16, GEN-11 |
| HTL-20 | User lists reservations Upcoming/Past/Cancelled (reference, hotel, rooms, dates, guests, total, status), open details | GET /api/hotel-bookings(/:id) | L | HTL-17 |
| HTL-21 | Cancel own Confirmed reservation as a whole before check-in after seeing refund (HTL-10 on full total). Rooms released, refund created. No partial cancellation | POST /api/hotel-bookings/:id/cancel | M | HTL-17, 10, PAY-03 |
| HTL-22 | Moderator views own hotel reservations (guest, dates, status) | GET /api/hotels/:id/reservations | L | HTL-17 |
| HTL-23 | Confirmed -> Completed after check-out date. One rating 1-5 + optional review (max 1000 chars) per Completed reservation (any room count); edit/delete later; avg rating recalculated | POST .../review, PATCH/DELETE /api/reviews/:id | M | HTL-17, GEN-11 |
| HTL-24 | Public view of avg rating, rating count, reviews (newest first, paginated) | GET /api/hotels/:id/reviews | L | HTL-23 |

## 4. Payments and Policies (module: payments)
| ID | Rule | Endpoint | L/M/H | Deps |
|---|---|---|---|---|
| PAY-01 | Pay Pending Payment booking within hold via Stripe test mode (PaymentIntents). Card details never reach backend. Confirm only after backend verifies PaymentIntent succeeded via webhook. On failure show error, retry until hold expires; on expiry cancel PaymentIntent. Store only Stripe payment ID, amount, currency, status | POST /api/payments, /:id/retry, GET /:id, POST /webhook | **H** | FLT-21, HTL-16, FLT-22, HTL-18 |
| PAY-02 | Show provider policies (airline: cancellation + baggage; hotel: cancellation + check-in/out) and require acceptance checkbox. Payment blocked until accepted; acceptance stored with timestamp | GET .../policies, POST .../accept-policies | L | FLT-04, 08, 09, HTL-09, 10 |
| PAY-03 | Any cancellation with positive refund (user per tiers, provider 100%): refund via Stripe Refunds API, record it, status Pending/Refunded/Failed, in-app notification | GET /api/refunds/:id | M | PAY-01, FLT-09, HTL-10, GEN-01 |
| PAY-04 | One platform currency for all flight/hotel prices, payments, refunds (not converted) | - | L | - |

## 5. Itineraries (module: itineraries)
| ID | Rule | Endpoint | L/M/H | Deps |
|---|---|---|---|---|
| ITN-01 | Create: title (max 100), >=1 country from list, start date. Edit; delete after confirmation. Private by default. Deleted disappears from public search; existing clones unaffected | POST/PATCH/DELETE /api/itineraries(/:id) | L | ACC-04, GEN-12 |
| ITN-03 | List own itineraries (title, countries, start date, days, visibility), most recently updated first; open details | GET /api/itineraries(/:id) | L | ITN-01 |
| ITN-05 | Add days; edit day city (from seeded cities) and notes. Sequential numbering, dates derived from start date, max 60 days | POST/PATCH .../days(/:dayId) | M | ITN-01, GEN-12 |
| ITN-07 | Delete day after confirmation; renumber, recalc dates and budgets | DELETE .../days/:dayId | M | ITN-05 |
| ITN-08 | Move day to new position; renumber, recalc dates and groups | PATCH .../days/reorder | M | ITN-05 |
| ITN-09 | Each day requires a city; consecutive same-city days shown as a group with day count + budget subtotal | response shape | M | ITN-05 |
| ITN-10 | Add/edit/delete activities per day: name, description, optional time, optional cost | POST .../activities, PATCH/DELETE /api/activities/:id | L | ITN-05 |
| ITN-12 | Attach/remove images on activity (GEN-08) | POST/DELETE /api/activities/:id/images | M | ITN-10, GEN-08 |
| ITN-14 | Budget entries per day (food, accommodation, local transport, activities), non-negative, selected currency. Totals by category and day include entries + activity costs (under Activities) + intercity transport | POST .../budgets, PATCH/DELETE /api/budgets/:id, GET .../budget-summary | M | ITN-05, 10, 16 |
| ITN-16 | Transport cost: mode, from-city, to-city, amount, currency, day | POST .../transport-costs, PATCH/DELETE /api/transport-costs/:id | L | ITN-05 |
| ITN-18 | Convert budget amounts to preferred currency using FXRatesAPI (backend only), fetched once/day, cached in DB; show rate date; API down -> last cached rates. Handle invalid currency. Bookings not converted | budget-summary | M | ITN-14, ACC-09, PAY-04 |
| ITN-20 | Set Public/Private. Public: shared search, read-only to others. Private removes immediately | PATCH /api/itineraries/:id | L | ITN-01 |
| ITN-21 | Search public itineraries by keyword (title/country/city); filter min/max days, country/city; view read-only with author, days, activities, budget. Registered user clones: all days/activities/budgets, private, credits original author, independent | GET /api/itineraries/public/search, /public/:id, POST /:id/clone | M | ITN-20 |
| ITN-25 | Pick city group, view hotels for group's dates (check-in = first day, check-out = day after last day) + guests + rooms; reuses HTL-11 | GET /api/itineraries/:id/hotels | M | ITN-09, HTL-11 |
| ITN-26 | Search one-way/round-trip flights from chosen origin to any airport in city of first day. Outbound defaults to start date, return to last day date; reuses FLT-11/12 | GET /api/itineraries/:id/flights | M | FLT-02, 11, 12, ITN-05 |

## 6. Blog and Community (module: blog)
| ID | Rule | Endpoint | L/M/H | Deps |
|---|---|---|---|---|
| BLG-01 | Create post: title, body, optional tags + images; Draft or Publish. Published appear in author's blog and search | POST /api/posts | L | ACC-04 |
| BLG-02 | Paginated published posts, filter by tag; post page: title, author, date, body, tags, images, like count, comments. Like/comment/report need login | GET /api/posts(/:id) | L | BLG-01, 08 |
| BLG-03 | List own posts incl. drafts (title, status, date, likes, comments) | GET /api/posts/mine | L | BLG-01 |
| BLG-04 | Author edits/deletes own posts | PATCH/DELETE /api/posts/:id | L | BLG-01 |
| BLG-05 | Comment on published post: non-empty, max 500, chronological | POST /api/posts/:id/comments | L | BLG-01 |
| BLG-06 | Like once, remove like, show count | POST/DELETE /api/posts/:id/like | L | BLG-01 |
| BLG-07 | Edit/delete own comments | PATCH/DELETE /api/comments/:id | L | BLG-05 |
| BLG-08 | Up to 5 tags (max 30 chars each); searchable, clickable | GET /api/tags/:tag/posts | L | BLG-01 |
| BLG-09 | Search published posts by keyword in title, tags, author name (title, author, date, excerpt, or "no results"). Order: likes+comments desc, newest first tie-break | GET /api/posts | M | BLG-01 |
| BLG-10 | Attach/remove post images (GEN-08) | POST/DELETE /api/posts/:id/images | M | BLG-01, GEN-08 |
| BLG-12 | Public author page: name, join date, published posts, public itineraries | GET /api/authors/:id | L | BLG-01, ITN-20 |

## 7. Cross-cutting (modules: common, notifications, reports, admin)
| ID | Rule | L/M/H | Deps |
|---|---|---|---|
| GEN-01 | In-app notifications (unread count, list, mark read) for booking confirmation, cancellation and refund, flight schedule change, account/provider suspension | M | - |
| GEN-02 | Field-level validation messages on all forms | L | - |
| GEN-03 | Confirmation before destructive actions (delete, cancel) | L | - |
| GEN-04 | Friendly empty states | L | - |
| GEN-05 | Paginate every list > 10 rows (page size 10) | L | - |
| GEN-06 | Flight times shown in each airport's local zone | M | FLT-02, 03 |
| GEN-07 | Audit log of admin actions (suspensions, deletions) | L | ACC-15, 16, GEN-10 |
| GEN-08 | Image uploads JPG/PNG, <=5 MB each, <=5 per post/activity/hotel, 1 logo per airline; stored on server, served by URL; else reject | M | - |
| GEN-09 | User reports post/comment/review/itinerary with reason, once per item | L | ACC-04 |
| GEN-10 | Admin lists open reports; dismiss, hide, or delete; may hide/delete any post/comment/review/itinerary directly. Hidden visible only to author and admins | M | GEN-09 |
| GEN-11 | Booking lifecycle (see top) | M | FLT-22, HTL-18, PAY-01 |
| GEN-12 | Seed airports, cities, countries, supported currencies at setup (use provided CSVs; ids must match) | L | - |
| GEN-13 | Backend enforces all validation, rules, authorization; passwords salted hashes | M | - |
| GEN-14..17 | UI/UX quality (navigation, feedback, responsiveness, consistency). Milestone 2 | M | - |

## Optional bonuses 
Email verification + forgot password (ACC-02/07) · email notifications · change flight / seat select (FLT-27/28) · hotel review reply (HTL-26) · attach bookings to itinerary (ITN-27) · itinerary PDF (ITN-28) · attach itinerary to post (BLG-13) · cloud deployment.

## Build order (by dependency)
 GEN-12 seed, GEN-08 uploads, GEN-01 notifications, ACC-01/04/19/06
 FLT-01..04, HTL-01..04, FLT-30
 Search (FLT-11/12/15, HTL-11/12/15) -> holds (FLT-22, HTL-16/18) -> PAY-02, PAY-01 -> confirm (FLT-23, HTL-17)
 Cancel/refund (FLT-26/06, HTL-21, PAY-03), reviews (HTL-23/24)
 Itineraries, blog, reports/moderation (GEN-09/10/07)

## Reference mock airports (8)
CAI Africa/Cairo · DXB Asia/Dubai · LHR Europe/London · JFK America/New_York · CDG Europe/Paris · HND Asia/Tokyo · RUH Asia/Riyadh · FRA Europe/Berlin
