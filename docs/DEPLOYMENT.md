# Deployment guide

## 1. Local development (no Docker)

Requirements: JDK 17+, Maven 3.9+, Node.js 18+ (22 recommended).

```bash
# API with an in-memory database, demo data and simulated payments
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev          # http://localhost:8080

# Web app (proxies /api to :8080)
cd frontend
npm ci
npm run dev                                                   # http://localhost:5173
```

* Swagger UI: http://localhost:8080/swagger-ui.html
* H2 console (dev only): http://localhost:8080/h2-console (JDBC URL `jdbc:h2:mem:bookingdb`, user `sa`)
* E-mails and SMS are **logged to the API console** in dev (look for `[EMAIL:log]` / `[SMS:log]` - e.g. the OTP and the password-reset link).
* Demo accounts: see the README.

To use a local PostgreSQL instead of H2, run without the `dev` profile:

```bash
createdb booking_db
export DB_PASSWORD=... JWT_SECRET=$(openssl rand -base64 48)
export SEED_DEMO_DATA=true PAYMENTS_DEMO_MODE=true   # optional, for a demo
mvn spring-boot:run
```

## 2. Docker Compose (single host / staging)

```bash
cp .env.example .env         # set DB_PASSWORD, JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD, ...
docker compose up -d --build
```

| URL | What |
|---|---|
| http://localhost:8081 | Web app (nginx) |
| http://localhost:8081/swagger-ui.html | API documentation |
| http://localhost:8025 | MailHog inbox (all e-mails sent by the app) |

Services: `db` (PostgreSQL 16), `redis` (slot locks), `backend`, `frontend` (nginx + reverse proxy),
`mailhog`, `backup` (daily `pg_dump` into `./backups`, 7-day retention).

The first admin is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` when the database has no admin yet.
For a demo with sample data set `SEED_DEMO_DATA=true` and `PAYMENTS_DEMO_MODE=true` **before the first start**.

## 3. Production checklist

| Area | Setting |
|---|---|
| Secrets | `JWT_SECRET` (≥ 32 random bytes, base64), strong `DB_PASSWORD`; keep `.env` out of git or use the platform's secret store |
| HTTPS (NFR-3) | Terminate TLS at the load balancer / nginx (e.g. Let's Encrypt). The API sends HSTS; set `APP_URL` to the https URL |
| Demo features | `SEED_DEMO_DATA=false`, `PAYMENTS_DEMO_MODE=false` (both default to false) |
| Payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`; configure a webhook to `https://<host>/api/payments/webhook` (events `payment.captured`, `payment.failed`) and set `RAZORPAY_WEBHOOK_SECRET` |
| E-mail | SMTP credentials (SendGrid: host `smtp.sendgrid.net`, user `apikey`; Amazon SES; ...), `MAIL_ENABLED=true`, `MAIL_FROM` on a verified domain |
| SMS | `SMS_PROVIDER=twilio` + `TWILIO_*` |
| Google sign-in | Create an OAuth client (Web) in Google Cloud, add the site origin, set `GOOGLE_CLIENT_ID` |
| Slot locks | `SLOT_LOCK_STORE=redis` when running more than one API instance |
| CORS | `CORS_ORIGINS` = the web origin(s) |
| Uploads | Mount a persistent volume at `UPLOAD_DIR` (or put the API behind shared storage) |
| Backups (NFR-8) | Keep the `backup` service (or managed DB snapshots). Copy `./backups` off-host (S3, rsync). Test restores with `scripts/restore.sh` |
| Monitoring | Health: `GET /actuator/health`; ship container logs; audit trail in the admin panel |

### Cloud options

* **Render / Railway / Fly.io**: deploy `backend/Dockerfile` as a web service (port 8080) with a managed PostgreSQL
  and Redis; deploy `frontend/` as a static site (`npm run build`, publish `dist/`) with a rewrite of `/api/*` to the
  API URL, or deploy `frontend/Dockerfile`.
* **Vercel (frontend) + any container host (API)**: add a rewrite `{"source": "/api/(.*)", "destination": "https://api.example.com/api/$1"}` and
  set `CORS_ORIGINS` to the Vercel URL.
* **AWS**: ECS Fargate (2+ tasks behind an ALB with health checks on `/actuator/health`), RDS PostgreSQL (Multi-AZ,
  automated backups), ElastiCache Redis, S3 + CloudFront for the static web app.

### Availability (NFR-4, 99.9 %)

Run at least two API replicas across zones, a managed PostgreSQL with automatic failover, and rolling deploys
(containers are health-checked; Flyway migrations are backwards-compatible additive changes). The app is stateless,
so an instance can be replaced at any time.

## 4. Database migrations

Schema changes are versioned SQL files in `backend/src/main/resources/db/migration` (`V2__...sql`, `V3__...sql`).
Flyway applies pending migrations on startup; Hibernate validates the result.

> Upgrading from the pre-Flyway version of this project: that version created tables with Hibernate
> `ddl-auto=update` and a different layout. Start from an empty database (or export the data you need first).

## 5. Backups & restore

```bash
# on demand
docker compose exec backup sh /usr/local/bin/backup.sh
# restore (replaces existing objects)
docker compose exec -T backup sh -c 'pg_restore --clean --if-exists --no-owner -d "$PGDATABASE"' < backups/booking_db-YYYYMMDD-HHMMSS.dump
```
