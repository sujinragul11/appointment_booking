# Architecture

## System overview

```mermaid
flowchart LR
    subgraph Client
        B["Browser / PWA<br/>React 18 + Vite<br/>(i18n: en, hi, ta)"]
    end
    subgraph Edge
        N["nginx<br/>static files, TLS, CSP,<br/>/api reverse proxy"]
    end
    subgraph API["Spring Boot 3 API (stateless, horizontally scalable)"]
        F["Filters: rate limit → JWT auth"]
        C["REST controllers<br/>(OpenAPI / Swagger)"]
        S["Services<br/>auth · catalog · availability ·<br/>booking · payments · reviews ·<br/>notifications · reports · audit"]
        E["Slot engine<br/>(hours, blocks, buffers,<br/>capacity, timezones, DST)"]
        J["Scheduled jobs<br/>reminders 24h/1h,<br/>release unpaid, purge holds"]
    end
    DB[("PostgreSQL<br/>Flyway migrations")]
    R[("Redis<br/>slot holds, TTL 10 min")]
    subgraph External["Third-party services"]
        M["SMTP (SendGrid / SES / MailHog)"]
        T["Twilio SMS"]
        P["Razorpay"]
        G["Google Identity"]
        V["Jitsi Meet (video links)"]
    end
    B --> N --> F --> C --> S
    S --> E
    S --> DB
    E --> DB
    S --> R
    J --> S
    S --> M & T & P & G
    S -. meeting link .-> V
    P -. webhook .-> N
```

## Booking sequence (race-safe, FR-20..24)

```mermaid
sequenceDiagram
    actor C as Customer
    participant W as Web app
    participant A as API
    participant DB as PostgreSQL
    participant L as Slot lock (DB/Redis)
    participant PG as Razorpay
    C->>W: pick service, date, time
    W->>A: GET /api/slots?providerId&serviceId&date
    A->>DB: weekly hours, blocked dates, overlapping bookings
    A->>L: active holds
    A-->>W: slots (AVAILABLE / BOOKED / HELD / BLOCKED)
    W->>A: POST /api/slots/hold
    A->>DB: SELECT provider FOR UPDATE
    A->>L: create hold (TTL 10 min)
    W->>A: POST /api/appointments
    A->>DB: SELECT provider FOR UPDATE (serialises bookings per provider)
    A->>A: re-check slot, pick free staff, redeem coupon (row lock)
    A->>DB: INSERT appointment (unique slot_key) + payment
    A-->>W: 201 PENDING (online) / CONFIRMED (pay at venue)
    W->>A: POST /api/payments/create-order
    A->>PG: create order
    W->>PG: Razorpay checkout
    W->>A: POST /api/payments/verify (HMAC signature)
    A->>DB: payment SUCCESS, appointment CONFIRMED
    A-->>C: e-mail + SMS + in-app confirmation
    PG-->>A: webhook payment.captured (backup path)
```

Double booking is prevented at three levels:
1. **Pessimistic lock** on the provider row for every write that consumes capacity (hold, book, reschedule).
2. **Re-validation** of the requested time against live data inside that transaction.
3. **Database unique constraint** on `appointments.slot_key` (`resource + start instant + seat`), cleared when a booking stops occupying capacity.

Unpaid online bookings keep their slot for 10 minutes (`payment_due_at`) and are then cancelled by a job.

## Appointment state machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: booked (online payment due, or provider approval needed)
    [*] --> CONFIRMED: booked (pay at venue + auto-confirm)
    PENDING --> CONFIRMED: paid (auto-confirm) / provider confirms
    PENDING --> CANCELLED: customer cancels / provider rejects / payment window expired
    CONFIRMED --> RESCHEDULED: new time
    PENDING --> PENDING: new time (still unconfirmed)
    RESCHEDULED --> RESCHEDULED: new time
    CONFIRMED --> CANCELLED: customer (policy refund) / provider (full refund)
    RESCHEDULED --> CANCELLED
    CONFIRMED --> COMPLETED: after start time
    RESCHEDULED --> COMPLETED
    CONFIRMED --> NO_SHOW: after start time
    RESCHEDULED --> NO_SHOW
    COMPLETED --> [*]: review + provider notes
    CANCELLED --> [*]
    NO_SHOW --> [*]
```

## Backend package layout

| Package | Responsibility |
|---|---|
| `controller` | REST endpoints, request validation, role checks (`@PreAuthorize`) |
| `service` | Business logic and transactions |
| `booking` | Slot engine, booking policy, slot lock stores (DB / Redis) |
| `payment` | Payment gateway abstraction + Razorpay implementation |
| `messaging` | E-mail (SMTP) and SMS (Twilio) senders |
| `security` | JWT issue/verify, filters, rate limiting, Google token verification |
| `entity`, `repository` | JPA model and Spring Data repositories |
| `dto`, `mapper` | API contracts and entity → DTO mapping |
| `config` | Security, CORS, OpenAPI, clock, async, seed data, admin bootstrap |

## Frontend layout

| Folder | Responsibility |
|---|---|
| `src/api` | Axios client with token refresh |
| `src/context` | Auth state |
| `src/i18n` | Translations (English, Hindi, Tamil) |
| `src/components` | Reusable UI (calendar, modal, toasts, password strength, …) |
| `src/pages` | Public pages, customer dashboard, provider / staff portal, admin panel |

## Scalability notes (NFR-1, NFR-2, NFR-4)

* The API is stateless (JWT), so it scales horizontally behind a load balancer; slot holds move to Redis
  (`SLOT_LOCK_STORE=redis`) so all instances share them.
* Slot computation is read-only and indexed (`appointments(provider_id, date)`, `start_at`), so browsing does not
  write to the database.
* Categories are cached; lists are paginated; JPA batch fetching avoids N+1 queries.
* Reminder and cleanup jobs are idempotent (flags / status checks), so running several instances is safe; for strict
  single execution add ShedLock or run jobs on one instance.
* For 99.9 % availability run ≥ 2 API instances, managed PostgreSQL with a standby, and health-checked containers
  (`/actuator/health`). See [DEPLOYMENT.md](DEPLOYMENT.md).
