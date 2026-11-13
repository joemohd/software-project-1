# SPEC.md: Travel Planning and Booking Platform

Source: official requirements sheet. Complexity: L/M/H. Deps = prerequisite IDs.
Global: page size 10 (GEN-05) · hold = 10 min · UTC storage, airport-local display (GEN-06) · backend enforces all rules (GEN-13) · single platform currency (PAY-04).

## Roles
Guest · Registered User · Admin (seeded only) · Airline Moderator · Hotel Moderator · System.

## Enums / lifecycle

| Enum / lifecycle | Transition | Trigger or condition | Requirement |
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

## Optional bonuses (not in sheet: do last)
Email verification + forgot password (ACC-02/07) · email notifications · change flight / seat select (FLT-27/28) · hotel review reply (HTL-26) · attach bookings to itinerary (ITN-27) · itinerary PDF (ITN-28) · attach itinerary to post (BLG-13) · cloud deployment.

## Build order (by dependency)
1. GEN-12 seed, GEN-08 uploads, GEN-01 notifications, ACC-01/04/19/06
2. FLT-01..04, HTL-01..04, FLT-30
3. Search (FLT-11/12/15, HTL-11/12/15) -> holds (FLT-22, HTL-16/18) -> PAY-02, PAY-01 -> confirm (FLT-23, HTL-17)
4. Cancel/refund (FLT-26/06, HTL-21, PAY-03), reviews (HTL-23/24)
5. Itineraries, blog, reports/moderation (GEN-09/10/07)

## Reference mock airports (8)
CAI Africa/Cairo · DXB Asia/Dubai · LHR Europe/London · JFK America/New_York · CDG Europe/Paris · HND Asia/Tokyo · RUH Asia/Riyadh · FRA Europe/Berlin
