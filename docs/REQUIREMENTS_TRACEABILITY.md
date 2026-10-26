# Requirements traceability

How each item of the specification is implemented. Paths are relative to the repository root;
`B:` = backend (`backend/src/main/java/com/booking/…`), `F:` = frontend (`frontend/src/…`).

Status: ✅ implemented · ◐ implemented with a documented simplification · ⏭ deferred (bonus, by agreement).

## 2. User roles

| Role | Implementation |
|---|---|
| Guest | Public endpoints (`/api/providers`, `/api/services`, `/api/slots`, `/api/categories`, …) and public pages (home, search, provider profile, slot picker) — no login needed until a slot is selected |
| Customer | `UserRole.CUSTOMER`; books, reschedules, cancels, pays, reviews (`/api/appointments`, `/api/payments`, `/api/reviews`) |
| Provider / Staff | `UserRole.PROVIDER` (business owner: `/api/provider/**`) and `UserRole.STAFF` (team member with own login: `/api/staff-portal/**`, own availability via `/api/availability/**`) |
| Admin | `UserRole.ADMIN`; `/api/admin/**` |

## 3. Functional requirements

### 3.1 Authentication & authorization

| ID | Status | Implementation |
|---|---|---|
| FR-1 Registration (name, e-mail, phone, password) | ✅ | `POST /api/auth/register` — B: `service/AuthService.register`, `dto/request/RegisterRequest`; F: `pages/Register.jsx` |
| FR-2 E-mail / phone verification via OTP | ✅ | 6-digit codes, hashed, 10-min expiry, 5 attempts, 1/min resend throttle — B: `service/VerificationService`; `POST /api/auth/send-verification`, `/verify`, `/verify-otp`; e-mail via SMTP, SMS via Twilio; bookings require a verified e-mail. F: verification step after sign-up, profile badges |
| FR-3 Login + JWT | ✅ | `POST /api/auth/login`; access (15 min) + refresh (7 days) JWTs with type claims — B: `security/JwtService`, `security/JwtAuthFilter` |
| FR-4 Forgot / reset via e-mail link | ✅ | Single-use, hashed, 30-min token; e-mailed link `/reset-password?token=…` — B: `AuthService.forgotPassword/resetPassword`; F: `/forgot-password`, `/reset-password` |
| FR-5 RBAC | ✅ | URL rules in B: `config/SecurityConfig`, `@PreAuthorize` on controllers, ownership checks in services; F: `components/ProtectedRoute.jsx` |
| FR-6 Google login | ✅ | ID token verified with Google (issuer, audience, expiry, verified e-mail) — B: `security/GoogleTokenVerifier`; enabled when `GOOGLE_CLIENT_ID` is set; F: Google Identity button on the login page |
| FR-7 Logout & session expiry | ✅ | `POST /api/auth/logout` revokes all tokens (token version); access tokens expire after 15 min and are refreshed silently; password change / deactivation also revoke — F: `api/client.js` refresh interceptor |
| FR-8 Password strength | ✅ | ≥ 8 chars, upper, lower, digit — B: `validation/StrongPassword`; F: `components/PasswordStrength.jsx`, `utils/password.js` |

### 3.2 Service management (admin)

| ID | Status | Implementation |
|---|---|---|
| FR-9 CRUD services (name, description, duration, price, category, image) | ✅ | `GET/POST/PUT/DELETE /api/admin/services` — B: `service/CatalogService`; image upload `POST /api/uploads` (`service/UploadService`); F: `pages/admin` services page |
| FR-10 Assign services to providers | ◐ | Each service belongs to one provider (`services.provider_id`); admins choose the provider on create, re-assign on edit, or copy a service to additional providers (`POST /api/admin/services/{id}/assign`). Per-provider copies let each provider keep its own price/duration |
| FR-11 Enable / disable services | ✅ | `PATCH /api/admin/services/{id}/active` (admins) and `PATCH /api/provider/services/{id}/active` (providers); disabled services are hidden and cannot be booked |
| FR-12 Service categories | ✅ | `POST/PUT/DELETE /api/admin/categories`, `GET /api/categories` (cached); deleting a category in use is refused |

### 3.3 Provider management

| ID | Status | Implementation |
|---|---|---|
| FR-13 Profile (bio, specialty, photo, rating) | ✅ | `PUT /api/provider/me` (description = bio, specialty, logo/cover upload); rating = average of approved reviews — F: provider settings, public profile |
| FR-14 Weekly availability | ✅ | Several windows per day (e.g. lunch breaks), per provider or per staff member — `PUT /api/availability/week`, `POST /api/availability` |
| FR-15 Block specific dates | ✅ | Whole day, time range, or custom hours for a date, per provider or staff — `POST /api/availability/blocked` (`blocked_dates`) |
| FR-16 Slot duration & buffer | ✅ | Service duration + buffer (`services.buffer_min`); optional fixed slot interval (`providers.slot_interval_min`); buffers are enforced between bookings |
| FR-17 Max bookings per day / slot | ✅ | `providers.max_bookings_per_day`, `providers.max_bookings_per_slot` (parallel capacity for services without staff) — enforced by `booking/SlotEngine` |

### 3.4 Appointment booking (core)

| ID | Status | Implementation |
|---|---|---|
| FR-18 Browse services by category / search | ✅ | `GET /api/services?q&categoryId&minPrice&maxPrice&mode&city&sort` — F: services page, categories page |
| FR-19 Provider list with filters (rating, price, availability) | ✅ | `GET /api/providers?minRating&minPrice&maxPrice&date&categoryId&city&mode&sort` — F: `pages/ProvidersPage.jsx` |
| FR-20 Real-time slots (calendar view) | ✅ | `GET /api/slots`, `GET /api/providers/{id}/slots` computed live from hours, bookings, holds and blocks — F: month calendar + slot grid in the booking wizard |
| FR-21 Date → slot → confirm | ✅ | F: `pages/BookingWizard.jsx`; `POST /api/slots/hold`, `POST /api/appointments` |
| FR-22 Prevent double booking (race-safe) | ✅ | Provider row lock (`SELECT … FOR UPDATE`) + re-check + unique `appointments.slot_key`; concurrency test in the test suite |
| FR-23 Confirmation with unique booking ID | ✅ | `BK-yymmdd-XXXXXX`, unique constraint and retry — F: success page |
| FR-24 E-mail / SMS on booking | ✅ | `service/NotificationService.bookingCreated/bookingConfirmed` → `messaging/EmailSender` (SMTP), `messaging/SmsSender` (Twilio) |
| FR-25 Notes / reason | ✅ | `appointments.notes` (≤ 1000 chars) |
| FR-26 In-person / online (video link) | ✅ | `services.mode` (IN_PERSON / ONLINE / BOTH); online bookings get a unique video room link (`app.video.base-url`, Jitsi Meet by default) |

### 3.5 Appointment management

| ID | Status | Implementation |
|---|---|---|
| FR-27 Customer dashboard (upcoming / past / cancelled) | ✅ | `GET /api/appointments/my?scope=upcoming|past|cancelled` — F: `pages/dashboard/CustomerDashboard.jsx` |
| FR-28 Reschedule (policy) | ✅ | `PATCH /api/appointments/{id}`; cut-off hours and maximum reschedules per provider — `booking/BookingPolicy` |
| FR-29 Cancel (reason, refund rules) | ✅ | `DELETE /api/appointments/{id}` with reason; `GET …/cancellation-preview`; full refund before the cut-off, configurable % after |
| FR-30 Provider confirm / reject / complete | ✅ | `PUT /api/appointments/{id}/status` (CONFIRMED, CANCELLED with reason = reject, COMPLETED) — provider and assigned staff |
| FR-31 Mark no-show | ✅ | Status `NO_SHOW` (after the start time) |
| FR-32 Post-appointment notes / prescription | ✅ | `PUT /api/appointments/{id}/notes` (after completion), visible to the customer |

### 3.6 Notifications

| ID | Status | Implementation |
|---|---|---|
| FR-33 E-mail confirmations (booking, cancellation, reminder) | ✅ | HTML e-mails via SMTP (SendGrid / SES / any SMTP; MailHog in Docker) |
| FR-34 SMS reminders 24 h & 1 h | ✅ | `service/SchedulerJobs.sendReminders` (every 5 min, sent once each, reset on reschedule) |
| FR-35 In-app notification centre | ✅ | `GET/PUT/DELETE /api/notifications…`, unread badge — F: notifications page, navbar bell |
| FR-36 Push notifications (optional PWA) | ◐ | Installable PWA with service worker; browser notifications shown for new in-app notifications while the app is open. Server-sent Web Push (VAPID) when the app is closed is not implemented |

### 3.7 Payments

| ID | Status | Implementation |
|---|---|---|
| FR-37 Online payment (Razorpay) | ✅ | Orders API + checkout signature verification + signed webhook — `payment/RazorpayGateway`, `service/PaymentService` (Stripe not implemented; the gateway is behind the `PaymentGateway` interface) |
| FR-38 Deposit or full payment | ✅ | `services.deposit_percent`; `paymentOption` FULL / DEPOSIT; balance collected at the venue (`POST /api/provider/appointments/{id}/collect`) |
| FR-39 Refund per policy | ✅ | Automatic refunds on cancellation (Razorpay refund API) |
| FR-40 Payment history & invoices | ✅ | `GET /api/payments/history`, PDF invoice `GET /api/appointments/{id}/invoice` |

### 3.8 Reviews & ratings

| ID | Status | Implementation |
|---|---|---|
| FR-41 Rate 1–5 after completed appointment | ✅ | `POST /api/reviews` (only the customer, only when COMPLETED, once) |
| FR-42 Written review with moderation | ✅ | Written reviews start PENDING; admins approve/reject (`/api/admin/reviews`); anyone can report a review; providers can reply |
| FR-43 Average rating on profile | ✅ | Recomputed from approved reviews (`providers.rating_avg`, `review_count`) |

### 3.9 Admin dashboard

| ID | Status | Implementation |
|---|---|---|
| FR-44 Manage users (activate / deactivate / delete) | ✅ | `/api/admin/users…`; deactivation revokes sessions; delete anonymises (booking history kept) |
| FR-45 All appointments (filter date, status, provider) | ✅ | `GET /api/admin/appointments?from&to&status&providerId&q` |
| FR-46 Reports (revenue, bookings, cancellations, peak hours) | ✅ | `GET /api/admin/reports/bookings` — `service/ReportService` |
| FR-47 Export CSV / PDF | ✅ | Appointments, users and reports — `service/ExportService` (OpenPDF) |
| FR-48 Audit logs | ✅ | `audit_logs` table, `GET /api/admin/audit-logs` — logins, lockouts, bookings, cancellations, refunds, admin actions |

### 3.10 Search & filters

| ID | Status | Implementation |
|---|---|---|
| FR-49 Search by service, provider, location | ✅ | `q` matches provider name, specialty, category, city, address and service names; `city` filter; nearby search by coordinates (`/api/providers/nearby`) |
| FR-50 Filter by date, price, rating, availability | ✅ | `date` (works that day and not closed), `minPrice`/`maxPrice`, `minRating`, `mode` |

## 4. Non-functional requirements

| ID | Status | Implementation / evidence |
|---|---|---|
| NFR-1 Performance | ✅ | Indexed queries, read-only slot computation, pagination, caching, gzip + immutable asset caching; k6 thresholds p95 < 500 ms (`loadtest/k6-booking.js`) |
| NFR-2 Scalability 10k+ users | ◐ | Stateless API (JWT) for horizontal scaling, Redis-backed slot holds, connection pooling; see ARCHITECTURE.md. Not load-tested at 10k in this environment |
| NFR-3 Security | ✅ | HTTPS/HSTS, BCrypt, JWT, CSRF not applicable (bearer tokens), XSS (React escaping, CSP), SQLi (JPA), rate limiting, lockout — see SECURITY.md |
| NFR-4 Availability 99.9 % | ◐ | Health checks, stateless replicas, restart policies; guidance for multi-instance/managed DB in DEPLOYMENT.md |
| NFR-5 Responsive | ✅ | Mobile-first CSS, checked at 375 px |
| NFR-6 Accessibility (WCAG 2.1 AA) | ✅ | Labels, keyboard navigation, focus management, skip link, ARIA live regions, contrast ≥ 4.5:1, page titles |
| NFR-7 ACID bookings | ✅ | Single transaction per booking with row lock + unique constraint |
| NFR-8 Daily backups | ✅ | `backup` service in docker-compose (`scripts/backup.sh`, 7-day retention), `scripts/restore.sh` |
| NFR-9 Multi-timezone & multi-language | ✅ | Provider timezone on every slot/booking (instants stored in UTC, DST handled); UI in English, Hindi, Tamil |
| NFR-10 Maintainability | ✅ | Layered modules, OpenAPI/Swagger docs, Flyway migrations, tests, CI |

## 5. Tech stack

The stack was kept as Spring Boot + React (agreed with the project owner); equivalents of the recommended tools:

| Recommended | Used |
|---|---|
| React / Next.js + TypeScript | React 18 + Vite (JavaScript) |
| Tailwind / Material UI | Custom CSS design system (`styles/global.css`) |
| Redux Toolkit / Zustand, React Query | React context + hooks, axios with interceptors |
| Node/NestJS, Django, Laravel | Spring Boot 3 (Java 17) |
| REST | REST + OpenAPI 3 |
| JWT + refresh tokens | ✅ |
| Zod / Joi | Jakarta Bean Validation |
| PostgreSQL / MySQL | PostgreSQL (Flyway); H2 in PostgreSQL mode for local runs and tests |
| Redis (caching + slot locking) | Redis slot locks (`SLOT_LOCK_STORE=redis`); in-process cache for categories |
| Nodemailer / SendGrid | Spring Mail over SMTP (works with SendGrid, SES, Gmail, MailHog) |
| Twilio | Twilio REST API |
| Stripe / Razorpay | Razorpay |
| Cloudinary / S3 | Local / volume storage (`UPLOAD_DIR`) |
| Firebase push | Service-worker notifications (see FR-36) |
| Docker, GitHub Actions | ✅ `docker-compose.yml`, `.github/workflows/ci.yml` |
| Vercel / Render / AWS | Documented in DEPLOYMENT.md |

## 6. Database schema

All core tables exist (see [ER_DIAGRAM.md](ER_DIAGRAM.md) for the mapping, including `provider_services` → `services.provider_id`).
Appointment status enum exactly: `PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW | RESCHEDULED`.

## 7. Key API endpoints

All sample endpoints exist with the same method and path — see the table at the top of [API.md](API.md).

## 8. User flows

| Flow | Implementation |
|---|---|
| Booking: guest browses → service → providers → calendar → slot → login if needed → confirm → payment → confirmation → e-mail/SMS | Home / Services / Providers → Provider profile → Booking wizard (login redirect keeps the selection) → Razorpay or pay at venue → success page; notifications sent by `NotificationService` |
| Cancellation: My appointments → cancel → reason → policy check (refund) → status + notifications | Appointment page → cancel dialog with required reason and refund preview → `DELETE /api/appointments/{id}` → refund + e-mail/SMS/in-app |

## 9. UI pages

| Page | Frontend |
|---|---|
| Landing / home | `pages/Home.jsx` |
| Service listing & search | services page, `pages/CategoriesPage.jsx` |
| Provider profile + reviews | `pages/ProviderDetail.jsx` |
| Booking calendar / slot picker | `pages/BookingWizard.jsx`, `components/Calendar.jsx` |
| Checkout / confirmation | booking wizard payment step, `pages/BookSuccess.jsx` |
| Login / Register / Forgot password | `pages/Login.jsx`, `pages/Register.jsx`, forgot/reset password pages |
| Customer dashboard | `pages/dashboard/CustomerDashboard.jsx`, `AppointmentDetail.jsx` |
| Provider dashboard (schedule manager) | `pages/provider/*` (week calendar, appointments, services, team, availability, settings, earnings, reviews) and staff portal |
| Admin panel (users, services, reports) | `pages/admin/*` |
| Notification centre | `pages/dashboard/NotificationsPage.jsx` |
| Profile & settings | `pages/dashboard/Profile.jsx` |
| 404 / error pages | `pages/NotFound.jsx`, `pages/ErrorPage.jsx` + `components/ErrorBoundary.jsx` |

## 10. Validation & edge cases

| Case | Implementation |
|---|---|
| No booking in the past | `SlotEngine.checkDate` + minimum notice (`providers.min_notice_min`) in the provider's timezone |
| No overlapping bookings | Buffer-aware overlap check under a provider lock + unique `slot_key` |
| Timezone conversions | Provider IANA timezone; UTC instants for all comparisons; UI shows provider time (and local time when different) |
| Slot lock during checkout (Redis TTL 10 min) | `POST /api/slots/hold`; `booking/RedisSlotLockService` (TTL) or DB fallback; unpaid online bookings are released after 10 min |
| Provider cancellation → auto-refund + notify | Provider/staff cancel or reject ⇒ 100 % refund + e-mail/SMS/in-app |
| Rate-limit login & booking | `security/RateLimitFilter` (429) + account lockout |
| Daylight saving changes | Non-existent local times skipped, overlaps resolved to the earlier offset; tested for America/New_York |

## 11. Testing

| Requirement | Implementation |
|---|---|
| Unit tests ≥ 70 % coverage | Backend JUnit 5 + JaCoCo gate (70 % lines) in `mvn verify`; frontend Vitest |
| Integration tests for booking flow | Spring Boot + MockMvc tests on H2 (and optional PostgreSQL run) |
| E2E tests | Playwright (`frontend/e2e`, `npm run e2e`) |
| Load testing | k6 (`loadtest/k6-booking.js`) |
| Security testing (OWASP Top 10) | Automated tests for authz, token handling, lockout, rate limits, validation; checklist in SECURITY.md |

## 12. Deliverables

| Deliverable | Location |
|---|---|
| Source code | `backend/`, `frontend/` |
| Database migrations & first admin | `backend/src/main/resources/db/migration`, `config/AdminBootstrap.java` |
| API documentation | Swagger UI, `docs/API.md`, `docs/openapi.json` (Postman import) |
| ER diagram & architecture diagram | `docs/ER_DIAGRAM.md`, `docs/ARCHITECTURE.md` |
| User manual | `docs/USER_MANUAL.md` |
| Deployment guide | `docs/DEPLOYMENT.md` |
| Test reports | `docs/TESTING.md`; CI uploads JaCoCo, Surefire and Playwright reports |

## 13. Bonus features

Deferred by agreement ("core first"), except those already present:

| Feature | Status |
|---|---|
| Multi-location support | ✅ provider branches |
| Loyalty points / coupons | ◐ coupons (loyalty points not implemented) |
| Google Calendar / Outlook sync | ◐ `.ics` calendar invites for every booking (one-way) |
| Video consultation | ◐ online mode with generated meeting links (no Zoom/Agora API) |
| AI slot recommendation, recurring appointments, waitlist, WhatsApp | ⏭ |
