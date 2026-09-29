-- ============================================================
-- Appointment Booking Platform - PostgreSQL schema
-- Matches the JPA entities in booking-backend (com.booking.entity)
-- Run: psql -U postgres -d booking_db -f schema-postgres.sql
-- ============================================================

DROP TABLE IF EXISTS staff_services        CASCADE;
DROP TABLE IF EXISTS provider_branches     CASCADE;
DROP TABLE IF EXISTS addresses             CASCADE;
DROP TABLE IF EXISTS notifications         CASCADE;
DROP TABLE IF EXISTS reviews               CASCADE;
DROP TABLE IF EXISTS payments              CASCADE;
DROP TABLE IF EXISTS appointments          CASCADE;
DROP TABLE IF EXISTS slots                 CASCADE;
DROP TABLE IF EXISTS availability_overrides CASCADE;
DROP TABLE IF EXISTS availability          CASCADE;
DROP TABLE IF EXISTS staff                 CASCADE;
DROP TABLE IF EXISTS services              CASCADE;
DROP TABLE IF EXISTS providers             CASCADE;
DROP TABLE IF EXISTS categories            CASCADE;
DROP TABLE IF EXISTS coupons               CASCADE;
DROP TABLE IF EXISTS users                 CASCADE;

-- ------------------------------------------------------------
-- users (one row per account; role = CUSTOMER / PROVIDER / ADMIN)
-- ------------------------------------------------------------
CREATE TABLE users (
    id                      BIGSERIAL PRIMARY KEY,
    name                    VARCHAR(100) NOT NULL,
    email                   VARCHAR(150) NOT NULL UNIQUE,
    phone                   VARCHAR(20),
    password                VARCHAR(255) NOT NULL,
    role                    VARCHAR(20)  NOT NULL DEFAULT 'CUSTOMER',
    otp                     VARCHAR(10),
    otp_expiry              TIMESTAMP(6),
    is_verified             BOOLEAN NOT NULL DEFAULT false,
    is_email_verified       BOOLEAN NOT NULL DEFAULT false,
    photo_url               VARCHAR(500),
    google_id               VARCHAR(150),
    notification_pref_email BOOLEAN NOT NULL DEFAULT true,
    notification_pref_sms   BOOLEAN NOT NULL DEFAULT true,
    notification_pref_push  BOOLEAN NOT NULL DEFAULT true,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMP(6),
    updated_at              TIMESTAMP(6)
);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role  ON users (role);

-- ------------------------------------------------------------
-- categories (Dentist, Salon & Spa, Tutor, ...)
-- ------------------------------------------------------------
CREATE TABLE categories (
    id    BIGSERIAL PRIMARY KEY,
    name  VARCHAR(80)  NOT NULL UNIQUE,
    icon  VARCHAR(100),
    slug  VARCHAR(120)
);

-- ------------------------------------------------------------
-- providers (one business per provider user)
-- ------------------------------------------------------------
CREATE TABLE providers (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL UNIQUE REFERENCES users (id),
    business_name           VARCHAR(120) NOT NULL,
    description             TEXT,
    logo_url                VARCHAR(500),
    cover_url               VARCHAR(500),
    category_id             BIGINT REFERENCES categories (id),
    city                    VARCHAR(100),
    state                   VARCHAR(100),
    country                 VARCHAR(100),
    address                 VARCHAR(255),
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    phone                   VARCHAR(20),
    website                 VARCHAR(200),
    status                  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    rating                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    review_count            INTEGER NOT NULL DEFAULT 0,
    max_advance_booking_days INTEGER NOT NULL DEFAULT 30,
    cancellation_policy     VARCHAR(500),
    admin_note              VARCHAR(500),
    created_at              TIMESTAMP(6),
    updated_at              TIMESTAMP(6)
);
CREATE INDEX idx_providers_city   ON providers (city);
CREATE INDEX idx_providers_status ON providers (status);

-- ------------------------------------------------------------
-- provider_branches (multi-location support)
-- ------------------------------------------------------------
CREATE TABLE provider_branches (
    id          BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES providers (id),
    name        VARCHAR(120) NOT NULL,
    address     VARCHAR(255),
    city        VARCHAR(100),
    state       VARCHAR(100),
    country     VARCHAR(100),
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION,
    phone       VARCHAR(20),
    is_main     BOOLEAN NOT NULL DEFAULT false
);

-- ------------------------------------------------------------
-- services (offerings of a provider)
-- ------------------------------------------------------------
CREATE TABLE services (
    id                       BIGSERIAL PRIMARY KEY,
    provider_id              BIGINT NOT NULL REFERENCES providers (id),
    name                     VARCHAR(120) NOT NULL,
    description              TEXT,
    duration_min             INTEGER NOT NULL,
    buffer_min               INTEGER NOT NULL DEFAULT 5,
    price                    DOUBLE PRECISION NOT NULL,
    category_id              BIGINT REFERENCES categories (id),
    image_url                VARCHAR(500),
    max_advance_booking_days INTEGER NOT NULL DEFAULT 30,
    cancellation_policy      VARCHAR(500),
    is_active                BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_services_provider ON services (provider_id);

-- ------------------------------------------------------------
-- staff (individual professionals under a provider)
-- ------------------------------------------------------------
CREATE TABLE staff (
    id           BIGSERIAL PRIMARY KEY,
    provider_id  BIGINT NOT NULL REFERENCES providers (id),
    name         VARCHAR(120) NOT NULL,
    designation  VARCHAR(120),
    photo_url    VARCHAR(500),
    bio          TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_staff_provider ON staff (provider_id);

-- Join table: which staff can perform which services
CREATE TABLE staff_services (
    service_id BIGINT NOT NULL REFERENCES services (id),
    staff_id   BIGINT NOT NULL REFERENCES staff (id),
    PRIMARY KEY (service_id, staff_id)
);

-- ------------------------------------------------------------
-- availability (recurring weekly rules; day_of_week 1=Mon..7=Sun;
-- staff_id NULL = applies to whole provider)
-- ------------------------------------------------------------
CREATE TABLE availability (
    id          BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES providers (id),
    staff_id    BIGINT REFERENCES staff (id),
    day_of_week INTEGER NOT NULL,
    start_time  TIME(6) NOT NULL,
    end_time    TIME(6) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uk_avail_provider_staff_day UNIQUE (provider_id, staff_id, day_of_week)
);

-- One-off date overrides (blocked / special hours)
CREATE TABLE availability_overrides (
    id          BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES providers (id),
    date        DATE NOT NULL,
    start_time  TIME(6),
    end_time    TIME(6),
    is_available BOOLEAN NOT NULL DEFAULT true,
    reason      VARCHAR(255),
    CONSTRAINT uk_override_provider_date UNIQUE (provider_id, date)
);

-- ------------------------------------------------------------
-- slots (generated day slots offered to customers)
-- ------------------------------------------------------------
CREATE TABLE slots (
    id          BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES providers (id),
    service_id  BIGINT,
    staff_id    BIGINT,
    date        DATE NOT NULL,
    start_time  TIME(6) NOT NULL,
    end_time    TIME(6) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
);
CREATE INDEX idx_slots_provider_date ON slots (provider_id, date);
CREATE INDEX idx_slots_status        ON slots (status);

-- ------------------------------------------------------------
-- appointments
-- status: PENDING / CONFIRMED / IN_PROGRESS / COMPLETED / CANCELLED
-- ------------------------------------------------------------
CREATE TABLE appointments (
    id            BIGSERIAL PRIMARY KEY,
    booking_ref   VARCHAR(40) NOT NULL UNIQUE,
    customer_id   BIGINT NOT NULL REFERENCES users (id),
    provider_id   BIGINT NOT NULL REFERENCES providers (id),
    service_id    BIGINT NOT NULL REFERENCES services (id),
    staff_id      BIGINT REFERENCES staff (id),
    date          DATE NOT NULL,
    start_time    TIME(6) NOT NULL,
    end_time      TIME(6) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    notes         TEXT,
    amount        DOUBLE PRECISION NOT NULL,
    discount      DOUBLE PRECISION NOT NULL DEFAULT 0,
    final_amount  DOUBLE PRECISION NOT NULL,
    coupon_code   VARCHAR(40),
    cancel_reason VARCHAR(255),
    created_at    TIMESTAMP(6)
);
CREATE INDEX idx_appt_customer       ON appointments (customer_id);
CREATE INDEX idx_appt_provider       ON appointments (provider_id);
CREATE INDEX idx_appt_provider_date  ON appointments (provider_id, date);
CREATE INDEX idx_appt_status         ON appointments (status);

-- ------------------------------------------------------------
-- payments (one per appointment)
-- ------------------------------------------------------------
CREATE TABLE payments (
    id                  BIGSERIAL PRIMARY KEY,
    appointment_id      BIGINT NOT NULL UNIQUE REFERENCES appointments (id),
    amount              DOUBLE PRECISION NOT NULL,
    method              VARCHAR(30) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    order_id            VARCHAR(100),
    txn_id              VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    refund_id           VARCHAR(100),
    paid_at             TIMESTAMP(6)
);
CREATE UNIQUE INDEX idx_payment_txn ON payments (txn_id);

-- ------------------------------------------------------------
-- reviews (one per appointment)
-- ------------------------------------------------------------
CREATE TABLE reviews (
    id             BIGSERIAL PRIMARY KEY,
    appointment_id BIGINT NOT NULL UNIQUE REFERENCES appointments (id),
    customer_id    BIGINT NOT NULL REFERENCES users (id),
    provider_id    BIGINT NOT NULL REFERENCES providers (id),
    rating         INTEGER NOT NULL,
    comment        TEXT,
    reply          TEXT,
    reply_at       TIMESTAMP(6),
    is_flagged     BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMP(6)
);
CREATE INDEX idx_review_provider ON reviews (provider_id);

-- ------------------------------------------------------------
-- coupons
-- ------------------------------------------------------------
CREATE TABLE coupons (
    id             BIGSERIAL PRIMARY KEY,
    code           VARCHAR(40) NOT NULL UNIQUE,
    discount_type  VARCHAR(20) NOT NULL,
    discount_value DOUBLE PRECISION NOT NULL,
    min_order      DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_discount   DOUBLE PRECISION NOT NULL DEFAULT 0,
    valid_from     DATE,
    valid_to       DATE,
    usage_limit    INTEGER NOT NULL DEFAULT 0,
    used_count     INTEGER NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
CREATE TABLE notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users (id),
    title      VARCHAR(150) NOT NULL,
    message    TEXT,
    type       VARCHAR(20) NOT NULL DEFAULT 'INFO',
    is_read    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP(6)
);
CREATE INDEX idx_notif_user ON notifications (user_id);

-- ------------------------------------------------------------
-- addresses (customer saved addresses)
-- ------------------------------------------------------------
CREATE TABLE addresses (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users (id),
    label        VARCHAR(60),
    address_line VARCHAR(255) NOT NULL,
    city         VARCHAR(100),
    state        VARCHAR(100),
    country      VARCHAR(60),
    zip          VARCHAR(20),
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    is_default   BOOLEAN NOT NULL DEFAULT false
);