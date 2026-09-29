package com.booking.security;

import com.booking.exception.ApiException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Set;

/**
 * Verifies a Google Identity Services ID token with Google's tokeninfo endpoint and checks
 * issuer, audience (our client id), expiry and e-mail verification (FR-6).
 */
@Slf4j
@Component
public class GoogleTokenVerifier {

    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    private final RestClient restClient;

    @Value("${app.google.client-id:}")
    private String clientId;

    public GoogleTokenVerifier(RestClient.Builder builder) {
        this.restClient = builder.baseUrl("https://oauth2.googleapis.com").build();
    }

    public boolean isEnabled() {
        return clientId != null && !clientId.isBlank();
    }

    public String getClientId() {
        return clientId;
    }

    public GoogleUser verify(String idToken) {
        if (!isEnabled()) {
            throw ApiException.unavailable("Google sign-in is not configured on this server");
        }
        TokenInfo info;
        try {
            info = restClient.get().uri(u -> u.path("/tokeninfo").queryParam("id_token", idToken).build())
                    .retrieve().body(TokenInfo.class);
        } catch (Exception e) {
            log.debug("Google token rejected: {}", e.getMessage());
            throw ApiException.unauthorized("Invalid Google credential");
        }
        if (info == null || !clientId.equals(info.aud) || !ISSUERS.contains(info.iss)
                || info.exp == null || Long.parseLong(info.exp) * 1000 < System.currentTimeMillis()) {
            throw ApiException.unauthorized("Invalid Google credential");
        }
        if (!"true".equalsIgnoreCase(info.emailVerified)) {
            throw ApiException.unauthorized("Google account e-mail is not verified");
        }
        return new GoogleUser(info.sub, info.email.toLowerCase(), info.name == null ? info.email : info.name, info.picture);
    }

    public record GoogleUser(String googleId, String email, String name, String picture) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class TokenInfo {
        public String iss;
        public String aud;
        public String sub;
        public String email;
        @JsonProperty("email_verified")
        public String emailVerified;
        public String name;
        public String picture;
        public String exp;
    }
}
