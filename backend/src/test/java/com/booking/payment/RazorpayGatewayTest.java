package com.booking.payment;

import com.booking.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** HMAC signatures (checkout + webhook), the demo simulation and the live Razorpay REST calls. */
class RazorpayGatewayTest {

    private static RazorpayGateway demo(String webhookSecret) {
        return new RazorpayGateway(RestClient.builder(), "", "", webhookSecret, true);
    }

    private static HttpStatus statusOf(Throwable e) {
        return ((ApiException) e).getStatus();
    }

    // ------------------------------------------------------------------ HMAC

    @Test
    void hmacMatchesTheRfc4231TestVector() {
        // RFC 4231 test case 2
        assertThat(RazorpayGateway.hmacHex("Jefe", "what do ya want for nothing?"))
                .isEqualTo("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    }

    @Test
    void demoSignaturesVerifyAndTamperingIsDetected() {
        RazorpayGateway gw = demo("");
        String sig = gw.demoSignature("order_1", "pay_1");

        assertThat(sig).matches("[0-9a-f]{64}");
        assertThat(gw.verifySignature("order_1", "pay_1", sig)).isTrue();
        assertThat(gw.verifySignature("order_1", "pay_2", sig)).isFalse();
        assertThat(gw.verifySignature("order_2", "pay_1", sig)).isFalse();
        assertThat(gw.verifySignature("order_1", "pay_1", sig.toUpperCase())).isFalse();
        assertThat(gw.verifySignature("order_1", "pay_1", null)).isFalse();
        assertThat(gw.verifySignature("order_1", "pay_1", "")).isFalse();
        // the demo secret is per instance, so another process cannot forge it
        assertThat(demo("").verifySignature("order_1", "pay_1", sig)).isFalse();
    }

    @Test
    void webhookSignatureUsesTheWebhookSecret() {
        RazorpayGateway gw = demo("whsec_test");
        String body = "{\"event\":\"payment.captured\"}";

        assertThat(gw.verifyWebhook(body, RazorpayGateway.hmacHex("whsec_test", body))).isTrue();
        assertThat(gw.verifyWebhook(body + " ", RazorpayGateway.hmacHex("whsec_test", body))).isFalse();
        assertThat(gw.verifyWebhook(body, RazorpayGateway.hmacHex("other", body))).isFalse();
        assertThat(gw.verifyWebhook(body, "")).isFalse();
        // without a configured secret no webhook is ever accepted
        assertThat(demo("").verifyWebhook(body, RazorpayGateway.hmacHex("any-secret", body))).isFalse();
        assertThat(demo(" ").verifyWebhook(body, "")).isFalse();
    }

    // ------------------------------------------------------------------ demo / disabled

    @Test
    void demoModeSimulatesOrdersAndRefunds() {
        RazorpayGateway gw = demo("");

        assertThat(gw.isLive()).isFalse();
        assertThat(gw.isAvailable()).isTrue();
        assertThat(gw.publicKey()).isNull();
        PaymentGateway.Order order = gw.createOrder("BK-1", 12_345, "INR");
        assertThat(order.orderId()).matches("order_demo_[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{14}");
        assertThat(order.amountMinor()).isEqualTo(12_345);
        assertThat(order.currency()).isEqualTo("INR");
        assertThat(gw.refund("pay_demo_x", 100).refundId()).startsWith("rfnd_demo_");
        assertThat(gw.refund(null, 100).refundId()).startsWith("rfnd_demo_");
    }

    @Test
    void withoutKeysAndDemoModeOnlinePaymentsAreUnavailable() {
        RazorpayGateway gw = new RazorpayGateway(RestClient.builder(), "", "", "", false);

        assertThat(gw.isAvailable()).isFalse();
        assertThatThrownBy(() -> gw.createOrder("BK-1", 100, "INR"))
                .satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE))
                .hasMessage("Online payments are not configured. Choose pay at venue.");
        assertThatThrownBy(() -> gw.demoSignature("o", "p"))
                .satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.FORBIDDEN));
    }

    // ------------------------------------------------------------------ live API

    private static String basicAuth() {
        return "Basic " + Base64.getEncoder().encodeToString("rzp_test_key:rzp_secret".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void liveModeCallsTheRazorpayApi() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RazorpayGateway gw = new RazorpayGateway(builder, "rzp_test_key", "rzp_secret", "", false);

        server.expect(requestTo("https://api.razorpay.com/v1/orders"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", basicAuth()))
                .andExpect(jsonPath("$.amount").value(50_000))
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.receipt").value("BK-1"))
                .andExpect(jsonPath("$.payment_capture").value(1))
                .andRespond(withSuccess("{\"id\":\"order_live_1\",\"status\":\"created\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_live_1/refund"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.amount").value(2_500))
                .andRespond(withSuccess("{\"id\":\"rfnd_live_1\"}", MediaType.APPLICATION_JSON));

        assertThat(gw.isLive()).isTrue();
        assertThat(gw.publicKey()).isEqualTo("rzp_test_key");
        assertThat(gw.createOrder("BK-1", 50_000, "INR").orderId()).isEqualTo("order_live_1");
        assertThat(gw.refund("pay_live_1", 2_500).refundId()).isEqualTo("rfnd_live_1");
        // demo payment ids never reach the API
        assertThat(gw.refund("pay_demo_abc", 100).refundId()).startsWith("rfnd_demo_");
        server.verify();

        // live signatures use the key secret, and demo signatures are refused
        String sig = RazorpayGateway.hmacHex("rzp_secret", "order_live_1|pay_live_1");
        assertThat(gw.verifySignature("order_live_1", "pay_live_1", sig)).isTrue();
        assertThatThrownBy(() -> gw.demoSignature("order_live_1", "pay_live_1"))
                .satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.FORBIDDEN))
                .hasMessage("Demo payments are disabled");
    }

    @Test
    void liveApiFailuresBecomeBadGateway() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RazorpayGateway gw = new RazorpayGateway(builder, "rzp_test_key", "rzp_secret", "", false);
        server.expect(requestTo("https://api.razorpay.com/v1/orders")).andRespond(withServerError());
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_live_2/refund")).andRespond(withServerError());

        assertThatThrownBy(() -> gw.createOrder("BK-2", 100, "INR"))
                .satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY))
                .hasMessage("Payment provider is unavailable. Please try again.");
        assertThatThrownBy(() -> gw.refund("pay_live_2", 100))
                .satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY))
                .hasMessage("Refund could not be processed by the payment provider");
        server.verify();
    }
}
