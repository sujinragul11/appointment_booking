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
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@Tag(name = "Payments")
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping("/create-order")
    @Operation(summary = "Create payment order for an appointment")
    public CreateOrderResponse createOrder(@RequestParam Long appointmentId) {
        return paymentService.createOrder(appointmentId);
    }

    @PostMapping("/verify")
    @Operation(summary = "Verify payment and confirm appointment")
    public PaymentResponse verify(@Valid @RequestBody VerifyPaymentRequest request) {
        return paymentService.verify(request);
    }

    @PostMapping("/{appointmentId}/fail")
    @Operation(summary = "Mark payment failed (cancels pending appointment)")
    public PaymentResponse fail(@PathVariable Long appointmentId) {
        return paymentService.markFailed(appointmentId);
    }

    @GetMapping("/history")
    public List<PaymentResponse> history() {
        return paymentService.history();
    }

    @PostMapping("/{appointmentId}/refund")
    @Operation(summary = "Refund a successful payment")
    public MessageResponse refund(@PathVariable Long appointmentId) {
        return paymentService.refund(appointmentId);
    }
}