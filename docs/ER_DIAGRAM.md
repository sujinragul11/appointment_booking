# Database schema & ER diagram

PostgreSQL 13+ (H2 in PostgreSQL mode for local runs/tests). The schema is created and versioned by
Flyway: [`backend/src/main/resources/db/migration`](../backend/src/main/resources/db/migration).
Hibernate only *validates* it (`ddl-auto: validate`).

```mermaid
erDiagram
    USERS ||--o| PROVIDERS : "owns (role PROVIDER)"
    USERS ||--o| STAFF : "logs in as (role STAFF)"
    USERS ||--o{ ADDRESSES : has
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ VERIFICATION_CODES : "OTP (email/phone)"
    USERS ||--o{ PASSWORD_RESET_TOKENS : "reset links"
    USERS ||--o{ APPOINTMENTS : "books (customer)"
    USERS ||--o{ REVIEWS : writes
    CATEGORIES ||--o{ PROVIDERS : classifies
    CATEGORIES ||--o{ SERVICES : classifies
    PROVIDERS ||--o{ SERVICES : "offers (provider_services)"
    PROVIDERS ||--o{ STAFF : employs
    PROVIDERS ||--o{ PROVIDER_BRANCHES : "locations"
    PROVIDERS ||--o{ AVAILABILITY : "weekly hours"
    PROVIDERS ||--o{ BLOCKED_DATES : "holidays / custom hours"
    PROVIDERS ||--o{ APPOINTMENTS : receives
    PROVIDERS ||--o{ REVIEWS : "is rated in"
    STAFF }o--o{ SERVICES : "staff_services"
    STAFF ||--o{ AVAILABILITY : "own hours"
    STAFF ||--o{ BLOCKED_DATES : "leave"
    STAFF ||--o{ APPOINTMENTS : "assigned to"
    SERVICES ||--o{ APPOINTMENTS : "booked as"
    APPOINTMENTS ||--|| PAYMENTS : "paid by"
    APPOINTMENTS ||--o| REVIEWS : "reviewed in"

    USERS {
        bigint id PK
        varchar name
        varchar email UK
        varchar phone
        varchar password_hash "BCrypt(12)"
        varchar role "CUSTOMER|PROVIDER|STAFF|ADMIN"
        boolean is_verified "e-mail OTP verified"
        boolean is_phone_verified
        varchar google_id UK
        boolean is_active
        boolean is_deleted "soft delete / anonymised"
        int token_version "JWT revocation"
        int failed_login_attempts
        timestamp locked_until
        varchar language
        varchar timezone
        timestamp created_at
    }
    PROVIDERS {
        bigint id PK
        bigint user_id FK,UK
        varchar business_name
        text description "bio"
        varchar specialty
        bigint category_id FK
        varchar city
        varchar timezone "IANA zone"
        varchar status "PENDING|VERIFIED|REJECTED|SUSPENDED"
        double rating_avg
        int review_count
        int slot_interval_min
        int max_bookings_per_day
        int max_bookings_per_slot
        int min_notice_min
        int max_advance_booking_days
        boolean auto_confirm
        int cancellation_cutoff_hours
        int late_cancel_refund_percent
        int reschedule_cutoff_hours
        int max_reschedules
    }
    SERVICES {
        bigint id PK
        bigint provider_id FK
        varchar name
        text description
        int duration_min
        int buffer_min
        double price
        int deposit_percent
        varchar mode "IN_PERSON|ONLINE|BOTH"
        bigint category_id FK
        varchar image_url
        boolean is_active
    }
    STAFF {
        bigint id PK
        bigint provider_id FK
        bigint user_id FK,UK "optional login"
        varchar name
        varchar designation
        boolean is_active
    }
    AVAILABILITY {
        bigint id PK
        bigint provider_id FK
        bigint staff_id FK "null = provider level"
        int day_of_week "1=Mon..7=Sun"
        time start_time
        time end_time
        boolean is_active
    }
    BLOCKED_DATES {
        bigint id PK
        bigint provider_id FK
        bigint staff_id FK
        date date
        time start_time "null = whole day"
        time end_time
        boolean is_available "true = custom hours"
        varchar reason
    }
    SLOT_HOLDS {
        bigint id PK
        varchar hold_token UK
        bigint provider_id
        bigint staff_id
        bigint user_id
        date date
        timestamptz start_at
        timestamptz end_at
        timestamptz expires_at "10 min TTL"
    }
    APPOINTMENTS {
        bigint id PK
        varchar booking_ref UK "BK-yymmdd-XXXXXX"
        bigint customer_id FK
        bigint provider_id FK
        bigint service_id FK
        bigint staff_id FK
        date date "provider-local"
        time start_time
        time end_time
        timestamptz start_at "UTC instant"
        timestamptz end_at
        timestamptz busy_until "end + buffer"
        varchar timezone
        varchar slot_key UK "non-null while occupying capacity"
        varchar status "PENDING|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW|RESCHEDULED"
        varchar mode
        varchar meeting_link
        text notes "customer reason"
        text provider_notes "post-visit notes / prescription"
        double amount
        double discount
        double final_amount
        varchar coupon_code
        varchar payment_status
        varchar cancelled_by
        int reschedule_count
        boolean reminder_24h_sent
        boolean reminder_1h_sent
        timestamptz payment_due_at
    }
    PAYMENTS {
        bigint id PK
        bigint appointment_id FK,UK
        double amount "charged online"
        double balance_due "payable at venue"
        varchar method "RAZORPAY|PAY_AT_VENUE"
        varchar payment_option "FULL|DEPOSIT|PAY_AT_VENUE"
        varchar status
        varchar order_id UK
        varchar transaction_id UK
        double refund_amount
        varchar invoice_number UK
    }
    REVIEWS {
        bigint id PK
        bigint appointment_id FK,UK
        bigint customer_id FK
        bigint provider_id FK
        int rating "1..5"
        text comment
        varchar status "PENDING|APPROVED|REJECTED"
        boolean is_flagged
        text reply
    }
    NOTIFICATIONS {
        bigint id PK
        bigint user_id FK
        varchar title
        text message
        varchar type
        varchar link
        boolean is_read
    }
    AUDIT_LOGS {
        bigint id PK
        bigint actor_id
        varchar actor_email
        varchar action
        varchar entity_type
        bigint entity_id
        text details
        varchar ip_address
        timestamp created_at
    }
    COUPONS {
        bigint id PK
        varchar code UK
        varchar discount_type
        double discount_value
        int usage_limit
        int used_count
        int per_user_limit
    }
```

## Mapping to the core tables in the specification

| Spec table | Implementation | Notes |
|---|---|---|
| `users` | `users` | + verification, lockout, token version, soft delete |
| `providers` | `providers` | `rating_avg`, `is_active` = `status` (VERIFIED is active) |
| `services` | `services` | + buffer, deposit %, mode (in-person / online) |
| `provider_services` | `services.provider_id` | a service is assigned to one provider; admins can re-assign or copy it to others (FR-10) |
| `availability` | `availability` | per provider or per staff member; several windows per day; slot length = service duration (+ buffer) or `providers.slot_interval_min` |
| `blocked_dates` | `blocked_dates` | whole-day, time-range or custom-hours entries |
| `appointments` | `appointments` | local date/time **and** UTC instants; `slot_key` unique constraint prevents double booking |
| `payments` | `payments` | deposit/balance, refunds, invoice number |
| `reviews` | `reviews` | moderation status, flagging, provider reply |
| `notifications` | `notifications` | in-app centre; e-mail/SMS are sent alongside |
| – | `audit_logs`, `slot_holds`, `verification_codes`, `password_reset_tokens`, `coupons`, `addresses`, `provider_branches`, `staff`, `staff_services`, `categories` | supporting tables |

**Appointment status enum** exactly as specified: `PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW | RESCHEDULED`.
