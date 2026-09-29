package com.booking.security;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Base64;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final byte[] SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef".getBytes();

    private static JwtService service(String secret, boolean ephemeral, long accessTtl) {
        JwtService jwt = new JwtService();
        ReflectionTestUtils.setField(jwt, "secret", secret);
        ReflectionTestUtils.setField(jwt, "allowEphemeral", ephemeral);
        ReflectionTestUtils.setField(jwt, "accessTtlMs", accessTtl);
        ReflectionTestUtils.setField(jwt, "refreshTtlMs", 3_600_000L);
        jwt.init();
        return jwt;
    }

    private static JwtService configured() {
        return service(Base64.getEncoder().encodeToString(SECRET), false, 900_000L);
    }

    private static User user() {
        return User.builder().id(42L).email("jane@example.test").name("Jane").password("x").role(UserRole.PROVIDER)
                .tokenVersion(3).build();
    }

    @Test
    void accessAndRefreshTokensCarryTheirTypeAndVersion() {
        JwtService jwt = configured();
        String access = jwt.generateAccessToken(user());
        String refresh = jwt.generateRefreshToken(user());

        var claims = jwt.parse(access, JwtService.TYPE_ACCESS).orElseThrow();
        assertThat(claims.userId()).isEqualTo(42L);
        assertThat(claims.version()).isEqualTo(3);
        assertThat(jwt.parse(refresh, JwtService.TYPE_REFRESH)).isPresent();
        assertThat(jwt.parse(access, JwtService.TYPE_REFRESH)).as("access token is not a refresh token").isEmpty();
        assertThat(jwt.parse(refresh, JwtService.TYPE_ACCESS)).as("refresh token is not an access token").isEmpty();
        assertThat(jwt.getAccessTtlSeconds()).isEqualTo(900);
    }

    @Test
    void tamperedForeignExpiredAndGarbageTokensAreRejected() {
        JwtService jwt = configured();
        String access = jwt.generateAccessToken(user());
        String tampered = access.substring(0, access.length() - 2) + (access.endsWith("AA") ? "BB" : "AA");

        assertThat(jwt.parse(tampered, JwtService.TYPE_ACCESS)).isEmpty();
        assertThat(service(null, true, 900_000L).parse(access, JwtService.TYPE_ACCESS)).as("signed with another key").isEmpty();
        assertThat(jwt.parse("not.a.jwt", JwtService.TYPE_ACCESS)).isEmpty();
        assertThat(jwt.parse("", JwtService.TYPE_ACCESS)).isEmpty();

        JwtService expired = service(Base64.getEncoder().encodeToString(SECRET), false, -1_000L);
        assertThat(expired.parse(expired.generateAccessToken(user()), JwtService.TYPE_ACCESS)).isEmpty();
    }

    @Test
    void missingVersionClaimNeverMatchesAUser() {
        String token = Jwts.builder().subject("7").claim("typ", "access")
                .expiration(new Date(System.currentTimeMillis() + 60_000)).signWith(Keys.hmacShaKeyFor(SECRET)).compact();

        assertThat(configured().parse(token, JwtService.TYPE_ACCESS).orElseThrow().version()).isEqualTo(-1);
    }

    @Test
    void secretIsRequiredOutsideDevAndTest() {
        assertThatThrownBy(() -> service("", false, 1L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("JWT_SECRET must be set");
        assertThatThrownBy(() -> service(Base64.getEncoder().encodeToString(new byte[16]), false, 1L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("JWT_SECRET must decode to at least 32 bytes");

        JwtService ephemeral = service(" ", true, 60_000L);
        assertThat(ephemeral.parse(ephemeral.generateAccessToken(user()), JwtService.TYPE_ACCESS)).isPresent();
    }
}
