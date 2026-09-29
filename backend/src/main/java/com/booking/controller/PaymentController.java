package com.booking.controller;

import com.booking.dto.request.VerifyPaymentRequest;
import com.booking.dto.response.CreateOrderResponse;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.PaymentResponse;
import com.booking.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@Tag(name = "Payments")
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping("/create-order")
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Create a Razorpay order for an unpaid booking (full amount or deposit)")
    public CreateOrderResponse createOrder(@RequestParam Long appointmentId) {
        return paymentService.createOrder(appointmentId);
    }

    @PostMapping("/verify")
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Verify the Razorpay checkout signature and confirm the booking")
    public PaymentResponse verify(@Valid @RequestBody VerifyPaymentRequest request) {
        return paymentService.verify(request);
    }

    @PostMapping("/demo/complete")
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Development only (payments demo mode): simulate a successful checkout")
    public PaymentResponse demoComplete(@RequestParam Long appointmentId) {
        return paymentService.completeDemo(appointmentId);
    }

    @PostMapping("/webhook")
    @Operation(summary = "Razorpay webhook (signed with the webhook secret)")
    public MessageResponse webhook(@RequestBody String body,
                                   @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        paymentService.webhook(body, signature == null ? "" : signature);
        return new MessageResponse("ok");
    }

    @GetMapping("/history")
    @Operation(summary = "My payment history (FR-40)")
    public List<PaymentResponse> history() {
        return paymentService.history();
    }
}
