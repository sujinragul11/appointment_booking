package com.booking.security;

import com.booking.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.hamcrest.Matchers.startsWith;

/** Google ID token checks against a stubbed tokeninfo endpoint. */
class GoogleTokenVerifierTest {

    private static final String CLIENT = "client-123.apps.googleusercontent.com";

    private MockRestServiceServer server;

    private GoogleTokenVerifier verifier(String clientId) {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        GoogleTokenVerifier v = new GoogleTokenVerifier(builder);
        ReflectionTestUtils.setField(v, "clientId", clientId);
        return v;
    }

    private static String future() {
        return String.valueOf(System.currentTimeMillis() / 1000 + 3600);
    }

    private static String tokenInfo(String iss, String aud, String exp, String emailVerified, String name) {
        return "{\"iss\":\"" + iss + "\",\"aud\":\"" + aud + "\",\"sub\":\"g-1\",\"email\":\"Jane.Doe@Example.com\","
                + "\"email_verified\":\"" + emailVerified + "\"," + (name == null ? "" : "\"name\":\"" + name + "\",")
                + "\"picture\":\"https://pic.example/j.png\"" + (exp == null ? "" : ",\"exp\":\"" + exp + "\"")
                + ",\"extra\":\"ignored\"}";
    }

    private void respond(String json) {
        server.expect(requestTo(startsWith("https://oauth2.googleapis.com/tokeninfo")))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andExpect(queryParam("id_token", "id-token"))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    private static void assertUnauthorized(Runnable call, String message) {
        assertThatThrownBy(call::run)
                .isInstanceOf(ApiException.class)
                .hasMessage(message)
                .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void validTokenYieldsTheGoogleUser() {
        GoogleTokenVerifier v = verifier(CLIENT);
        respond(tokenInfo("https://accounts.google.com", CLIENT, future(), "true", "Jane Doe"));

        GoogleTokenVerifier.GoogleUser user = v.verify("id-token");

        assertThat(user.googleId()).isEqualTo("g-1");
        assertThat(user.email()).isEqualTo("jane.doe@example.com");
        assertThat(user.name()).isEqualTo("Jane Doe");
        assertThat(user.picture()).isEqualTo("https://pic.example/j.png");
        assertThat(v.isEnabled()).isTrue();
        assertThat(v.getClientId()).isEqualTo(CLIENT);
        server.verify();
    }

    @Test
    void nameFallsBackToTheEmailAndBothIssuerFormsAreAccepted() {
        GoogleTokenVerifier v = verifier(CLIENT);
        respond(tokenInfo("accounts.google.com", CLIENT, future(), "TRUE", null));

        assertThat(v.verify("id-token").name()).isEqualTo("Jane.Doe@Example.com");
    }

    @Test
    void wrongAudienceIssuerOrExpiryIsRejected() {
        GoogleTokenVerifier wrongAud = verifier(CLIENT);
        respond(tokenInfo("https://accounts.google.com", "someone-else", future(), "true", "J"));
        assertUnauthorized(() -> wrongAud.verify("id-token"), "Invalid Google credential");

        GoogleTokenVerifier wrongIss = verifier(CLIENT);
        respond(tokenInfo("https://evil.example", CLIENT, future(), "true", "J"));
        assertUnauthorized(() -> wrongIss.verify("id-token"), "Invalid Google credential");

        GoogleTokenVerifier expired = verifier(CLIENT);
        respond(tokenInfo("https://accounts.google.com", CLIENT, "1000", "true", "J"));
        assertUnauthorized(() -> expired.verify("id-token"), "Invalid Google credential");

        GoogleTokenVerifier noExpiry = verifier(CLIENT);
        respond(tokenInfo("https://accounts.google.com", CLIENT, null, "true", "J"));
        assertUnauthorized(() -> noExpiry.verify("id-token"), "Invalid Google credential");
    }

    @Test
    void unverifiedGoogleEmailIsRejected() {
        GoogleTokenVerifier v = verifier(CLIENT);
        respond(tokenInfo("https://accounts.google.com", CLIENT, future(), "false", "J"));

        assertUnauthorized(() -> v.verify("id-token"), "Google account e-mail is not verified");
    }

    @Test
    void tokeninfoErrorsAreUnauthorized() {
        GoogleTokenVerifier v = verifier(CLIENT);
        server.expect(requestTo(startsWith("https://oauth2.googleapis.com/tokeninfo")))
                .andRespond(withBadRequest().body("{\"error\":\"invalid_token\"}").contentType(MediaType.APPLICATION_JSON));

        assertUnauthorized(() -> v.verify("id-token"), "Invalid Google credential");
    }

    @Test
    void disabledWithoutAClientId() {
        GoogleTokenVerifier v = verifier("");

        assertThat(v.isEnabled()).isFalse();
        assertThatThrownBy(() -> v.verify("anything"))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        assertThat(verifier(null).isEnabled()).isFalse();
    }
}
