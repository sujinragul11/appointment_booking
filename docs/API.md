# API reference

Interactive documentation: **Swagger UI** at `/swagger-ui.html` (e.g. http://localhost:8080/swagger-ui.html).
Machine-readable spec: [`openapi.json`](openapi.json) (OpenAPI 3) - import it into **Postman** (*File → Import*) to get a ready-made collection.

Authentication: `POST /api/auth/login` returns `accessToken` (15 min) and `refreshToken` (7 days). Send `Authorization: Bearer <accessToken>`; refresh with `POST /api/auth/refresh`.
Errors use one JSON shape: `{ "status": 400, "error": "Bad Request", "message": "...", "errors": { "field": "..." } }`.

## Endpoints required by the specification

| Spec | Implemented as |
|---|---|
| `POST /api/auth/register` | `POST /api/auth/register` |
| `POST /api/auth/login` | `POST /api/auth/login` |
| `POST /api/auth/forgot-password` | `POST /api/auth/forgot-password` (+ `POST /api/auth/reset-password`) |
| `GET /api/services` | `GET /api/services?q&categoryId&minPrice&maxPrice&mode&city&sort&page&size` |
| `GET /api/providers?serviceId=&date=` | `GET /api/providers?serviceId&date&q&categoryId&city&minRating&minPrice&maxPrice&mode&sort` |
| `GET /api/providers/:id/slots?date=` | `GET /api/providers/{id}/slots?date&serviceId&staffId` |
| `POST /api/appointments` | `POST /api/appointments` |
| `GET /api/appointments/my` | `GET /api/appointments/my?scope=upcoming\|past\|cancelled\|all` |
| `PATCH /api/appointments/:id` (reschedule) | `PATCH /api/appointments/{id}` |
| `DELETE /api/appointments/:id` (cancel) | `DELETE /api/appointments/{id}` with `{ "reason": "..." }` |
| `POST /api/reviews` | `POST /api/reviews` |
| `GET /api/admin/reports/bookings` | `GET /api/admin/reports/bookings?from&to&providerId` (+ `/export?format=csv\|pdf`) |

## Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/forgot-password` | E-mail a password reset link (FR-4) |
| POST | `/api/auth/google` | Sign in with a Google ID token (FR-6) |
| POST | `/api/auth/login` | Login with e-mail/password; returns access + refresh JWT (FR-3) |
| POST | `/api/auth/logout` | Revoke all tokens of the current user (FR-7) |
| GET | `/api/auth/me` |  |
| PUT | `/api/auth/password` | Change password; other sessions are signed out and new tokens returned |
| PUT | `/api/auth/profile` |  |
| POST | `/api/auth/refresh` | Exchange a refresh token for new tokens |
| POST | `/api/auth/register` | Register a customer or provider (FR-1); an e-mail verification code is sent |
| POST | `/api/auth/reset-password` | Set a new password using the token from the reset link |
| POST | `/api/auth/send-verification` | Send an e-mail or SMS verification code (FR-2) |
| POST | `/api/auth/verify` | Verify e-mail or phone with the code (FR-2) |
| POST | `/api/auth/verify-otp` | Public e-mail verification with e-mail + code |

## Public catalogue

| Method | Path | Description |
|---|---|---|
| GET | `/api/categories` |  |
| GET | `/api/config` | Public client configuration (feature flags, public keys) |
| GET | `/api/coupons/validate` | Preview a coupon discount (does not consume it) |
| GET | `/api/providers` | Search providers: q (service/provider/location), categoryId, city, minRating, minPrice, maxPrice, serviceId, date, mode, sort |
| GET | `/api/providers/nearby` |  |
| GET | `/api/providers/{id}` | Provider profile with services, staff, branches, rating and policy (FR-13) |
| GET | `/api/providers/{id}/availability` |  |
| GET | `/api/providers/{id}/reviews` |  |
| GET | `/api/providers/{id}/services` |  |
| GET | `/api/providers/{id}/slots` | Real-time slots for a date (FR-20). serviceId defaults to the provider's first service |
| GET | `/api/providers/{id}/staff` |  |
| GET | `/api/reviews/provider/{id}` |  |
| GET | `/api/services` | Browse / search services (FR-18): q, categoryId, providerId, minPrice, maxPrice, mode, city, sort |
| GET | `/api/services/{id}` |  |
| GET | `/api/slots` | Real-time slots for provider + service (+ staff) on a date |
| GET | `/api/staff/provider/{providerId}` |  |
| GET | `/api/uploads/{name}` |  |

## Appointments

| Method | Path | Description |
|---|---|---|
| POST | `/api/appointments` | Book an appointment (FR-21..26). Race-safe: the slot is re-checked under a lock |
| GET | `/api/appointments/my` | My appointments; scope = upcoming / past / cancelled / all (FR-27) |
| GET | `/api/appointments/ref/{ref}` |  |
| DELETE | `/api/appointments/{id}` | Cancel with reason; refund per policy (FR-29, FR-39) |
| GET | `/api/appointments/{id}` |  |
| PATCH | `/api/appointments/{id}` | Reschedule (FR-28): subject to cut-off and maximum reschedules |
| PUT | `/api/appointments/{id}` | Reschedule (FR-28): subject to cut-off and maximum reschedules |
| PUT | `/api/appointments/{id}/cancel` |  |
| GET | `/api/appointments/{id}/cancellation-preview` | Policy check before cancelling: allowed? refund amount? |
| GET | `/api/appointments/{id}/ics` | Download a calendar invite |
| GET | `/api/appointments/{id}/invoice` | Download the invoice PDF (FR-40) |
| PUT | `/api/appointments/{id}/notes` | Provider/staff: post-appointment notes or prescription (FR-32) |
| PATCH | `/api/appointments/{id}/reschedule` | Reschedule (FR-28): subject to cut-off and maximum reschedules |
| PUT | `/api/appointments/{id}/reschedule` | Reschedule (FR-28): subject to cut-off and maximum reschedules |
| PUT | `/api/appointments/{id}/status` | Provider/staff: CONFIRMED, CANCELLED (reject, needs reason), COMPLETED, NO_SHOW (FR-30, FR-31) |
| POST | `/api/slots/hold` | Lock a slot for 10 minutes during checkout |
| DELETE | `/api/slots/hold/{token}` |  |

## Payments

| Method | Path | Description |
|---|---|---|
| POST | `/api/payments/create-order` | Create a Razorpay order for an unpaid booking (full amount or deposit) |
| POST | `/api/payments/demo/complete` | Development only (payments demo mode): simulate a successful checkout |
| GET | `/api/payments/history` | My payment history (FR-40) |
| POST | `/api/payments/verify` | Verify the Razorpay checkout signature and confirm the booking |
| POST | `/api/payments/webhook` | Razorpay webhook (signed with the webhook secret) |

## Account

| Method | Path | Description |
|---|---|---|
| GET | `/api/addresses` |  |
| POST | `/api/addresses` |  |
| DELETE | `/api/addresses/{id}` |  |
| GET | `/api/notifications` |  |
| PUT | `/api/notifications/read-all` |  |
| GET | `/api/notifications/unread-count` |  |
| DELETE | `/api/notifications/{id}` |  |
| PUT | `/api/notifications/{id}/read` |  |
| POST | `/api/reviews` | Rate (1-5) and review a completed appointment (FR-41, FR-42) |
| POST | `/api/reviews/{id}/flag` | Report a review for moderation |
| POST | `/api/uploads` | Upload an image (PNG/JPEG/WebP/GIF, max 2 MB) |

## Availability

| Method | Path | Description |
|---|---|---|
| POST | `/api/availability` | Add a weekly window (FR-14) |
| POST | `/api/availability/blocked` | Block a date / time range (holiday, leave) or set custom hours for a date (FR-15) |
| DELETE | `/api/availability/blocked/{id}` |  |
| GET | `/api/availability/me` |  |
| PUT | `/api/availability/week` | Replace the weekly schedule (provider level, or one staff member) |
| DELETE | `/api/availability/{id}` |  |
| PUT | `/api/availability/{id}` |  |

## Provider portal

| Method | Path | Description |
|---|---|---|
| GET | `/api/provider/appointments` |  |
| GET | `/api/provider/appointments/day` | Schedule for one day |
| GET | `/api/provider/appointments/export` |  |
| POST | `/api/provider/appointments/{id}/collect` | Record the amount collected at the venue |
| GET | `/api/provider/branches` |  |
| POST | `/api/provider/branches` |  |
| DELETE | `/api/provider/branches/{id}` |  |
| GET | `/api/provider/earnings` |  |
| GET | `/api/provider/me` |  |
| PUT | `/api/provider/me` | Profile, timezone, slot rules (interval, per-day / per-slot limits) and policies (FR-13, FR-16, FR-17) |
| GET | `/api/provider/reports` |  |
| GET | `/api/provider/reviews` |  |
| PUT | `/api/provider/reviews/{id}/reply` |  |
| GET | `/api/provider/services` |  |
| POST | `/api/provider/services` |  |
| PUT | `/api/provider/services/{id}` |  |
| PATCH | `/api/provider/services/{id}/active` |  |
| GET | `/api/provider/staff` |  |
| POST | `/api/provider/staff` | Add a staff member; with an e-mail, a STAFF login is created and a set-password link sent |
| DELETE | `/api/provider/staff/{id}` |  |
| PUT | `/api/provider/staff/{id}` |  |
| GET | `/api/provider/stats` |  |

## Staff portal

| Method | Path | Description |
|---|---|---|
| GET | `/api/staff-portal/appointments` |  |
| GET | `/api/staff-portal/me` |  |

## Admin

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/appointments` |  |
| GET | `/api/admin/appointments/export` | Export appointments as CSV or PDF (FR-47) |
| GET | `/api/admin/audit-logs` |  |
| POST | `/api/admin/categories` |  |
| DELETE | `/api/admin/categories/{id}` |  |
| PUT | `/api/admin/categories/{id}` |  |
| GET | `/api/admin/coupons` |  |
| POST | `/api/admin/coupons` |  |
| DELETE | `/api/admin/coupons/{id}` |  |
| PUT | `/api/admin/coupons/{id}` |  |
| GET | `/api/admin/providers` |  |
| PUT | `/api/admin/providers/{id}/decision` | Approve (VERIFIED), reject or suspend a provider |
| GET | `/api/admin/reports/bookings` | Revenue, bookings, cancellations and peak hours for a date range |
| GET | `/api/admin/reports/bookings/export` |  |
| GET | `/api/admin/reviews` |  |
| PUT | `/api/admin/reviews/{id}/moderate` |  |
| GET | `/api/admin/services` |  |
| POST | `/api/admin/services` | Create a service and assign it to a provider (providerId) |
| DELETE | `/api/admin/services/{id}` |  |
| PUT | `/api/admin/services/{id}` | Update a service; a different providerId re-assigns it |
| PATCH | `/api/admin/services/{id}/active` | Enable / disable a service |
| POST | `/api/admin/services/{id}/assign` | Assign (copy) this service to another provider |
| GET | `/api/admin/stats` |  |
| GET | `/api/admin/users` |  |
| GET | `/api/admin/users/export` |  |
| DELETE | `/api/admin/users/{id}` | Delete (anonymise) a user; booking history is kept |
| PATCH | `/api/admin/users/{id}/active` |  |
