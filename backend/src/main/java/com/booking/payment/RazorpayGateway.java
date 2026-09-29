package com.booking.payment;

import com.booking.exception.ApiException;
import com.booking.util.BookingUtils;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

/**
 * Razorpay Orders / Payments API. When no keys are configured and app.payments.demo-mode=true,
 * it runs as a local simulation whose "signatures" are HMACs with a per-process secret, so the
 * browser still cannot fake a payment.
 */
@Slf4j
@Component
public class RazorpayGateway implements PaymentGateway {

    private final RestClient client;
    private final String keyId;
    private final String keySecret;
    private final String webhookSecret;
    private final boolean demoMode;
    private final String demoSecret = BookingUtils.generateToken();

    public RazorpayGateway(RestClient.Builder builder,
                           @Value("${app.payments.razorpay.key-id:}") String keyId,
                           @Value("${app.payments.razorpay.key-secret:}") String keySecret,
                           @Value("${app.payments.razorpay.webhook-secret:}") String webhookSecret,
                           @Value("${app.payments.demo-mode:false}") boolean demoMode) {
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = webhookSecret;
        this.demoMode = demoMode;
        String auth = Base64.getEncoder().encodeToString((keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8));
        this.client = builder.baseUrl("https://api.razorpay.com/v1").defaultHeader("Authorization", "Basic " + auth).build();
        if (!isLive()) {
            log.warn(demoMode ? "Razorpay keys not set - payments run in DEMO mode (simulated)"
                    : "Razorpay keys not set and demo mode is off - online payments are disabled");
        }
    }

    @Override
    public boolean isLive() {
        return !keyId.isBlank() && !keySecret.isBlank();
    }

    public boolean isAvailable() {
        return isLive() || demoMode;
    }

    @Override
    public String publicKey() {
        return isLive() ? keyId : null;
    }

    @Override
    public Order createOrder(String receipt, long amountMinor, String currency) {
        ensureAvailable();
        if (!isLive()) {
            return new Order("order_demo_" + BookingUtils.randomString(14), amountMinor, currency);
        }
        try {
            JsonNode res = client.post().uri("/orders").contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("amount", amountMinor, "currency", currency, "receipt", receipt, "payment_capture", 1))
                    .retrieve().body(JsonNode.class);
            return new Order(res.get("id").asText(), amountMinor, currency);
        } catch (Exception e) {
            log.error("Razorpay order creation failed: {}", e.getMessage());
            throw ApiException.badGateway("Payment provider is unavailable. Please try again.");
        }
    }

    @Override
    public boolean verifySignature(String orderId, String paymentId, String signature) {
        String secret = isLive() ? keySecret : demoSecret;
        return BookingUtils.constantTimeEquals(hmacHex(secret, orderId + "|" + paymentId), signature);
    }

    /** Only for the demo checkout: produces the signature a real gateway would return. */
    public String demoSignature(String orderId, String paymentId) {
        if (isLive() || !demoMode) {
            throw ApiException.forbidden("Demo payments are disabled");
        }
        return hmacHex(demoSecret, orderId + "|" + paymentId);
    }

    @Override
    public boolean verifyWebhook(String body, String signature) {
        return !webhookSecret.isBlank() && BookingUtils.constantTimeEquals(hmacHex(webhookSecret, body), signature);
    }

    @Override
    public Refund refund(String paymentId, long amountMinor) {
        if (!isLive() || paymentId == null || paymentId.startsWith("pay_demo_")) {
            return new Refund("rfnd_demo_" + BookingUtils.randomString(14));
        }
        try {
            JsonNode res = client.post().uri("/payments/{id}/refund", paymentId).contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("amount", amountMinor)).retrieve().body(JsonNode.class);
            return new Refund(res.get("id").asText());
        } catch (Exception e) {
            log.error("Razorpay refund failed for {}: {}", paymentId, e.getMessage());
            throw ApiException.badGateway("Refund could not be processed by the payment provider");
        }
    }

    private void ensureAvailable() {
        if (!isAvailable()) {
            throw ApiException.unavailable("Online payments are not configured. Choose pay at venue.");
        }
    }

    static String hmacHex(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
