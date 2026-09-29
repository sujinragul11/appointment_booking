package com.booking.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Twilio delivery (stubbed HTTP) and the log-only fallback. */
class SmsSenderTest {

    private static SmsSender sender(String provider, String sid, String token, String from) {
        SmsSender sms = new SmsSender();
        ReflectionTestUtils.setField(sms, "provider", provider);
        ReflectionTestUtils.setField(sms, "accountSid", sid);
        ReflectionTestUtils.setField(sms, "authToken", token);
        ReflectionTestUtils.setField(sms, "fromNumber", from);
        return sms;
    }

    private static MockRestServiceServer stubHttp(SmsSender sms) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ReflectionTestUtils.setField(sms, "restClient", builder.build());
        return server;
    }

    @Test
    void liveOnlyWithTwilioAndAllCredentials() {
        assertThat(sender("log", "AC1", "tok", "+1555").isLive()).isFalse();
        assertThat(sender("twilio", "", "tok", "+1555").isLive()).isFalse();
        assertThat(sender("twilio", "AC1", "", "+1555").isLive()).isFalse();
        assertThat(sender("twilio", "AC1", "tok", "").isLive()).isFalse();
        assertThat(sender("TWILIO", "AC1", "tok", "+1555").isLive()).isTrue();
    }

    @Test
    void blankRecipientsAndLogModeSendNothing() {
        SmsSender sms = sender("log", "", "", "");
        MockRestServiceServer server = stubHttp(sms);

        sms.send(null, "Hi");
        sms.send("  ", "Hi");
        sms.send("+919000000001", "Hi");

        server.verify(); // no HTTP expectations -> no calls were made
    }

    @Test
    void twilioReceivesTheMessage() {
        SmsSender sms = sender("twilio", "AC123", "secret-token", "+15550001111");
        MockRestServiceServer server = stubHttp(sms);
        String auth = "Basic " + Base64.getEncoder().encodeToString("AC123:secret-token".getBytes(StandardCharsets.UTF_8));
        server.expect(requestTo("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", auth))
                .andExpect(content().formDataContains(Map.of("To", "+919000000001", "From", "+15550001111",
                        "Body", "Your code is 123456")))
                .andRespond(withSuccess());

        sms.send("+919000000001", "Your code is 123456");

        server.verify();
    }

    @Test
    void twilioFailuresAreSwallowed() {
        SmsSender sms = sender("twilio", "AC123", "secret-token", "+15550001111");
        MockRestServiceServer server = stubHttp(sms);
        server.expect(requestTo("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json")).andRespond(withServerError());

        assertThatCode(() -> sms.send("+919000000001", "Hello")).doesNotThrowAnyException();
        server.verify();
    }
}
