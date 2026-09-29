package com.booking.payment;

/** Abstraction over the payment provider (FR-37). */
public interface PaymentGateway {

    record Order(String orderId, long amountMinor, String currency) {}

    record Refund(String refundId) {}

    /** true = real gateway (Razorpay); false = local simulation for development. */
    boolean isLive();

    String publicKey();

    Order createOrder(String receipt, long amountMinor, String currency);

    /** Verifies the checkout signature returned to the browser. */
    boolean verifySignature(String orderId, String paymentId, String signature);

    /** Verifies the X-Razorpay-Signature header of a webhook body. */
    boolean verifyWebhook(String body, String signature);

    Refund refund(String paymentId, long amountMinor);
}
