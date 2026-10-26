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
cp .env.example .env    # set DB_PASSWORD, JWT_SECRET (openssl rand -base64 48), ADMIN_EMAIL and ADMIN_PASSWORD
docker compose up -d --build
```

Open http://localhost:8081 (API docs at http://localhost:8081/swagger-ui.html, e-mail inbox at http://localhost:8025).

### Option B — local development (no database needed)

Requirements: JDK 17+, Maven 3.9+, Node.js 18+.

```bash
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev     # API on :8080, in-memory DB
cd frontend && npm ci && npm run dev                                  # web app on :5173
```

In the `dev` profile, e-mails and SMS (verification codes, password-reset links, reminders) are printed in the API
console, and online payments use a simulated gateway.
The profile uses an in-memory H2 database in PostgreSQL compatibility mode and exposes the H2 console at
`http://localhost:8080/h2-console`. It starts empty and is discarded when the API stops.

## First admin account

The database ships with no accounts or sample data. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters with upper
case, lower case and a number) before starting the API; the admin is created when no admin exists yet. Sign in as that
admin to add categories and approve providers; customers and providers register through the web app.

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
k6 run loadtest/k6-booking.js         # load test (needs LOGIN_EMAIL, LOGIN_PASSWORD, PROVIDER_ID, SERVICE_ID; see the file)
```
