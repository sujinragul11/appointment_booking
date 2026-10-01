# Sloto — Appointment Booking System

A web application where customers book appointments with service providers (doctors, dentists, salons,
consultants, tutors, trainers…), providers and their staff manage their schedules, and admins run the platform.

* **Backend:** Spring Boot 3.4 (Java 17) REST API, JWT + refresh tokens, PostgreSQL with Flyway migrations,
  Redis (slot locks), Razorpay, SMTP e-mail, Twilio SMS, OpenAPI/Swagger.
* **Frontend:** React 18 + Vite SPA (installable PWA), English / हिन्दी / தமிழ், WCAG 2.1 AA, mobile-first.
* **Ops:** Docker Compose (PostgreSQL, Redis, MailHog, nginx, daily backups), GitHub Actions CI.

## Quick start

### Option A — everything in Docker

```bash
cp .env.example .env    # set DB_PASSWORD and JWT_SECRET (openssl rand -base64 48)
                        # for a demo also set SEED_DEMO_DATA=true and PAYMENTS_DEMO_MODE=true
docker compose up -d --build
```

Open http://localhost:8081 (API docs at http://localhost:8081/swagger-ui.html, e-mail inbox at http://localhost:8025).

### Option B — local development (no database needed)

Requirements: JDK 17+, Maven 3.9+, Node.js 18+.

```bash
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev     # API on :8080, in-memory DB + demo data
cd frontend && npm ci && npm run dev                                  # web app on :5173
```

<<<<<<< HEAD
In the `dev` profile, e-mails and SMS (verification codes, password-reset links, reminders) are printed in the API
console, and online payments use a simulated gateway.
=======
Runs an in-memory H2 database in MySQL compatibility mode (schema auto-created on every boot; starts empty apart from the admin account). H2 console available at `http://localhost:8080/h2-console`.
>>>>>>> a52368e (backendcommit)

## Demo accounts (`dev` profile or `SEED_DEMO_DATA=true`)

| Role | E-mail | Password | Notes |
|---|---|---|---|
| Admin | admin@booking.com | Admin@123 | Admin panel |
| Customer | customer@booking.com | Customer@123 | Has past, upcoming and cancelled bookings |
| Customer | anita@booking.com | Customer@123 | |
| Provider | provider@booking.com | Provider@123 | Smile Dental Clinic — services booked with a dentist (staff) |
| Staff | staff@booking.com | Staff@123 | Dr. Arun Prakash at Smile Dental (own schedule) |
| Provider | salon@booking.com | Salon@123 | Glow & Glam Salon — 3 parallel bookings per slot |
| Provider | tutor@booking.com | Tutor@123 | Bright Minds Tutoring — London timezone, online lessons |
| Provider | doctor@booking.com | Doctor@123 | HealthFirst Clinic — in-person or video consultation |
| Provider | physio@booking.com, skin@booking.com, fitness@booking.com, consultant@booking.com | Physio@123, Skin@123, Fitness@123, Consult@123 | |
| Provider (pending approval) | newclinic@booking.com | Provider@123 | Visible to admins only until approved |

Coupons: `FIRST50` (₹50 off, once per customer), `SAVE20` (20 % off orders ≥ ₹500, max ₹200), `WELCOME100`.

## What's included

| Area | Highlights |
|---|---|
| Accounts | Registration, e-mail and phone verification by OTP, login with lockout, Google sign-in, password reset by e-mail link, strong-password policy, logout / session expiry, roles: guest, customer, provider, staff, admin |
| Discovery | Search services and providers by name, category and location; filters for date availability, price, rating and in-person/online |
| Booking | Real-time slots (calendar), staff choice or "any available", notes, coupons, 10-minute slot hold at checkout, double-booking protection, in-person or video appointments, booking reference, e-mail/SMS confirmation, calendar invite |
| Managing bookings | Customer dashboard (upcoming / past / cancelled), reschedule and cancel within policy with automatic refunds, provider confirm / reject / complete / no-show, post-visit notes or prescription |
| Providers & staff | Profile, weekly hours with breaks, blocked dates and custom hours, slot length and buffers, per-day and per-slot limits, services, team with staff logins, reviews, earnings and reports |
| Payments | Razorpay (full or deposit), pay at venue, refunds by policy, payment history, PDF invoices |
| Notifications | In-app centre, e-mail, SMS, reminders 24 h and 1 h before, browser notifications |
| Admin | Users (activate / deactivate / delete), provider approval, services and categories, all appointments, reports (revenue, bookings, cancellations, peak hours), CSV / PDF export, review moderation, audit log, coupons |

The complete requirement-by-requirement mapping is in [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | How to use the app as a customer, provider, staff member and admin |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, booking sequence, appointment state machine |
| [docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md) | Database schema and ER diagram |
| [docs/API.md](docs/API.md) · [docs/openapi.json](docs/openapi.json) | REST API reference (import the OpenAPI file into Postman) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local, Docker and cloud deployment, configuration, backups |
| [docs/SECURITY.md](docs/SECURITY.md) | Security design and OWASP Top 10 checklist |
| [docs/TESTING.md](docs/TESTING.md) | Test strategy and latest test report |

## Project structure

```
├── backend/          Spring Boot API (src/main/java/com/booking, Flyway migrations in src/main/resources/db/migration)
├── frontend/         React SPA (src/pages, src/components, src/i18n, e2e/)
├── docs/             Documentation deliverables
├── loadtest/         k6 load test
├── scripts/          Backup / restore
├── docker-compose.yml
└── .github/workflows CI pipeline
```

## Running the tests

```bash
cd backend  && mvn verify             # unit + integration tests, fails below 70 % line coverage
cd frontend && npm test               # component and unit tests (Vitest)
cd frontend && npm run e2e            # end-to-end tests (Playwright; needs the dev API on :8080)
k6 run loadtest/k6-booking.js         # load test
```
<<<<<<< HEAD
=======

Connection defaults: `jdbc:postgresql://localhost:5432/booking_db`, user `postgres`, password `sujin` — override with `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`. On first boot the schema (16 tables) is created and the admin account is added. The PostgreSQL driver is already in `pom.xml`, so the MySQL-managed-schema SQL in `application.yml` (`createDatabaseIfNotExist`) is the only MySQL-specific bit; it is replaced by this profile.

The backend starts on **http://localhost:8080**. Swagger UI is at `http://localhost:8080/swagger-ui.html`.

## Frontend Setup

Requirements: Node.js 18+.

```bash
cd frontend
npm install
npm run dev
```

Starts the Vite dev server on **http://localhost:5173** and proxies `/api` calls to the backend at `http://localhost:8080` (see `frontend/vite.config.js`). For a production build: `npm run build` (output in `frontend/dist/`).

## Admin Account & Data Entry

No demo data is seeded. On startup `DataSeeder` only creates the platform admin, and only when no admin exists yet (admins cannot self-register):

| Role  | Email             | Password  |
|-------|-------------------|-----------|
| Admin | admin@booking.com | Admin@123 |

Override these with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables before the first boot.

Everything else is entered through the app:

1. As admin, add service categories in Admin » Categories (and any coupons in Admin » Coupons).
2. Providers register via **Create an account** → *I'm a Service Provider*; the admin approves them in Admin » Providers. Each provider then signs in to **their own** dashboard (`/dashboard/provider`) to add services, staff, and availability.
3. Customers register via **Create an account** and book from there.

## Feature Overview

**Customer**
- Browse/search providers by city & category; view provider details, services, staff, reviews.
- 3-step booking wizard: pick a service → pick an appointment slot → pay at venue or pay online (Razorpay-style flow).
- Coupon codes applied at checkout with discount calculation.
- Dashboard: upcoming/past appointments, cancellation, rescheduling, status timeline.
- Leave ratings & reviews, manage saved addresses, notifications, profile.

**Provider**
- Dashboard with today's appointments and monthly revenue.
- Manage services, staff, weekly availability + date overrides, earnings, and profile.
- Accept/reject/complete appointments.

**Admin**
- Platform stats, approval of pending provider registrations.
- User management (view, activate/deactivate), category management, coupon CRUD.

## Payment Flow

- `PAY_AT_VENUE` → appointment immediately `CONFIRMED`.
- `RAZORPAY` → appointment starts `PENDING`; after `POST /api/payments/create-order` and `POST /api/payments/verify`, the appointment moves to `CONFIRMED` with the recorded payment.
>>>>>>> a52368e (backendcommit)
