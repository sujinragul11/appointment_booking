# Appointment Booking Platform

A full-stack appointment booking system ("Sloto") with a **Spring Boot 3** backend and a **React (Vite)** frontend. Customers can browse providers, book appointments, apply coupons, and manage bookings; providers manage services, staff, and availability; admins approve providers and manage users and coupons.

## Project Structure

```
├── backend/    Spring Boot 3.4 REST API (Java 17+)
└── frontend/   React 18 + Vite 5 SPA
```

## Backend Setup

Requirements: JDK 17+ and Maven 3.9+.

### Default profile (MySQL)

```bash
cd backend
export DB_URL=jdbc:mysql://localhost:3306/booking_db?createDatabaseIfNotExist=true&serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true
export DB_USERNAME=root
export DB_PASSWORD=root
mvn spring-boot:run
```

The DB URL, username, and password can be overridden via the `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD` environment variables (defaults: `root`/`root`, database `booking_db` auto-created). `ddl-auto: update` creates/syncs the schema automatically.

### Demo profile (H2, no MySQL needed)

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=h2
```

Runs an in-memory H2 database in MySQL compatibility mode (schema auto-created, data seeded on every boot). H2 console available at `http://localhost:8080/h2-console`.

### PostgreSQL profile

Requires a running PostgreSQL server. The database `booking_db` must exist (created once with `CREATE DATABASE booking_db;`); tables are created automatically by Hibernate (`ddl-auto: update`).

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=postgres
```

Connection defaults: `jdbc:postgresql://localhost:5432/booking_db`, user `postgres`, password `sujin` — override with `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`. On first boot the schema (16 tables) is created and demo data is seeded. The PostgreSQL driver is already in `pom.xml`, so the MySQL-managed-schema SQL in `application.yml` (`createDatabaseIfNotExist`) is the only MySQL-specific bit; it is replaced by this profile.

The backend starts on **http://localhost:8080**. Swagger UI is at `http://localhost:8080/swagger-ui.html`.

## Frontend Setup

Requirements: Node.js 18+.

```bash
cd frontend
npm install
npm run dev
```

Starts the Vite dev server on **http://localhost:5173** and proxies `/api` calls to the backend at `http://localhost:8080` (see `frontend/vite.config.js`). For a production build: `npm run build` (output in `frontend/dist/`).

## Demo Accounts

The seeder (`DataSeeder`) runs on every H2 boot and on an empty MySQL database:

| Role     | Email                | Password       | Provider (own dashboard)    |
|----------|----------------------|----------------|-----------------------------|
| Customer | customer@booking.com | Customer@123   | —                           |
| Provider | provider@booking.com | Provider@123   | Smile Dental Clinic         |
| Provider | salon@booking.com    | Salon@123      | Glow & Glam Salon           |
| Provider | physio@booking.com   | Physio@123     | CareWell Physiotherapy      |
| Provider | tutor@booking.com    | Tutor@123      | Bright Minds Tutoring       |
| Provider | skin@booking.com     | Skin@123       | Perfect Skin Clinic         |
| Provider | fitness@booking.com  | Fitness@123    | Nova Fitness Studio         |
| Admin    | admin@booking.com    | Admin@123      | —                           |

Each provider signs in with their own email/password and is redirected to **their own** dashboard (`/dashboard/provider`), which shows only their appointments, services, staff, availability, and earnings. New providers who register are created with their own account + pending profile, and the admin approves them in Admin » Providers.

Seeded content: 8 users, 6 providers (incl. "Smile Dental Clinic"), 8 service categories, and 3 coupons (`FIRST50`, `SAVE20` min order ₹500, `WELCOME100`).

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
- User management (view, activate/deactivate), coupon CRUD.

## Payment Flow

- `PAY_AT_VENUE` → appointment immediately `CONFIRMED`.
- `RAZORPAY` → appointment starts `PENDING`; after `POST /api/payments/create-order` and `POST /api/payments/verify`, the appointment moves to `CONFIRMED` with the recorded payment.