package com.booking.security;

import com.booking.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.security.SecureRandom;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

/**
 * Issues and parses JWTs. Access and refresh tokens carry a {@code typ} claim so one
 * cannot be used as the other, and a {@code ver} claim matched against
 * {@link User#getTokenVersion()} so logout / password changes revoke them (FR-3, FR-7).
 */
@Slf4j
@Service
public class JwtService {

    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REFRESH = "refresh";

    @Value("${app.jwt.secret:}")
    private String secret;

    @Value("${app.jwt.allow-ephemeral-secret:false}")
    private boolean allowEphemeral;

    @Value("${app.jwt.access-expiration-ms}")
    private long accessTtlMs;

    @Value("${app.jwt.refresh-expiration-ms}")
    private long refreshTtlMs;

    private SecretKey key;

    @PostConstruct
    void init() {
        if (secret == null || secret.isBlank()) {
            if (!allowEphemeral) {
                throw new IllegalStateException("JWT_SECRET must be set (base64, >= 32 bytes). "
                        + "Generate one with: openssl rand -base64 48");
            }
            byte[] bytes = new byte[48];
            new SecureRandom().nextBytes(bytes);
            key = Keys.hmacShaKeyFor(bytes);
            log.warn("JWT_SECRET not set - using a random ephemeral key (dev/test only; tokens reset on restart)");
            return;
        }
        byte[] decoded = Decoders.BASE64.decode(secret);
        if (decoded.length < 32) {
            throw new IllegalStateException("JWT_SECRET must decode to at least 32 bytes");
        }
        key = Keys.hmacShaKeyFor(decoded);
    }

    public String generateAccessToken(User user) {
        return build(user, TYPE_ACCESS, accessTtlMs);
    }

    public String generateRefreshToken(User user) {
        return build(user, TYPE_REFRESH, refreshTtlMs);
    }

    public long getAccessTtlSeconds() {
        return accessTtlMs / 1000;
    }

    private String build(User user, String type, long ttl) {
        Date now = new Date();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(user.getId()))
                .claim("typ", type)
                .claim("ver", user.getTokenVersion())
                .claim("role", user.getRole().name())
                .claim("email", user.getEmail())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + ttl))
                .signWith(key)
                .compact();
    }

    /** Parses and verifies signature + expiry; empty if the token is invalid or of another type. */
    public Optional<TokenClaims> parse(String token, String expectedType) {
        try {
            Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            if (!expectedType.equals(c.get("typ", String.class))) {
                return Optional.empty();
            }
            Integer ver = c.get("ver", Integer.class);
            return Optional.of(new TokenClaims(Long.valueOf(c.getSubject()), ver == null ? -1 : ver));
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Rejected JWT: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public record TokenClaims(Long userId, int version) {}
}
