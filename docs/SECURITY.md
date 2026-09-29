# Security (NFR-3, OWASP Top 10)

| OWASP 2021 | Risk | Mitigation in this project |
|---|---|---|
| A01 Broken access control | Users acting on others' data | URL rules per role (`/api/admin/**` ADMIN, `/api/provider/**` PROVIDER, `/api/staff-portal/**` STAFF) + `@PreAuthorize`; every appointment/payment/review access is checked against the owner, the provider, the assigned staff member or an admin, returning 404 for others; providers can only link their own staff; admins cannot deactivate themselves |
| A02 Cryptographic failures | Weak secrets, plaintext tokens | BCrypt (cost 12) passwords; HMAC-SHA JWTs with a required ≥256-bit secret (no default); OTP codes and reset tokens stored as SHA-256 hashes; HTTPS + HSTS in production |
| A03 Injection | SQL / header / CSV / ICS injection | JPA with bound parameters and Criteria API only; CSV export escapes formula prefixes (`= + - @`); ICS text is escaped; Bean Validation on every request body |
| A04 Insecure design | Double booking, payment bypass | Provider row lock + unique `slot_key`; checkout holds; payment confirmed only via Razorpay HMAC signature or signed webhook; demo gateway must be explicitly enabled |
| A05 Security misconfiguration | Verbose errors, open consoles | Generic 500 messages (details only in logs); H2 console and demo data only in the `dev` profile; actuator exposes `health` and `info` only; security headers (nosniff, frame DENY, referrer policy, CSP at nginx) |
| A06 Vulnerable components | Outdated libraries | Spring Boot 3.4 BOM; `npm audit` / Dependabot recommended in CI |
| A07 Identification & authentication failures | Brute force, account takeover | Password policy (8+ chars, upper, lower, digit - FR-8); lockout after 5 failed logins for 15 min; rate limiting on auth endpoints (429); single-use, 30-minute reset links; OTP expiry (10 min) and attempt limit (5); generic answers for unknown e-mails; access (15 min) and refresh (7 days) tokens with distinct types; logout / password change / deactivation revoke all tokens; Google ID tokens verified (issuer, audience, expiry, verified e-mail) |
| A08 Software & data integrity | Tampered webhooks | Razorpay webhook HMAC verification; Flyway checksums on migrations |
| A09 Logging & monitoring | Untraceable actions | Audit log of logins, lockouts, bookings, cancellations, refunds, admin actions (with actor, IP, time) browsable by admins |
| A10 SSRF | Server fetching user URLs | The server only calls fixed hosts (Google, Razorpay, Twilio); uploaded files are validated by magic bytes and served with `nosniff` |

## CSRF

Authentication uses a bearer token in the `Authorization` header, never a cookie, so a browser does not attach
credentials to cross-site requests and CSRF tokens are not required. CORS is limited to the configured web origins.

## XSS

React escapes all rendered values; the app never uses `dangerouslySetInnerHTML` for user data. E-mails are rendered
with HTML-escaped content. nginx sends a restrictive Content-Security-Policy.

## Rate limiting

In-memory fixed windows per client IP: 10/min for authentication endpoints, 20/min for booking/hold, 120/min for public
slot/coupon lookups. Behind several API instances add a shared limiter at the proxy (nginx `limit_req`, API gateway).

## Reporting

Security testing performed is described in [TESTING.md](TESTING.md).
