package com.booking.controller;

import com.booking.dto.request.ReviewRequest;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.ReviewResponse;
import com.booking.service.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
@Tag(name = "Reviews")
public class ReviewController {

    private final ReviewService reviewService;

    @GetMapping("/provider/{providerId}")
    @Operation(summary = "Public: reviews of a provider")
    public List<ReviewResponse> list(@PathVariable Long providerId) {
        return reviewService.listByProvider(providerId);
    }

    @PostMapping
    @Operation(summary = "Create review after completed appointment (CUSTOMER)")
    public ReviewResponse create(@Valid @RequestBody ReviewRequest request) {
        return reviewService.create(request);
    }

    @PutMapping("/{id}/reply")
    @Operation(summary = "Provider replies to a review")
    public ReviewResponse reply(@PathVariable Long id, @RequestBody String reply) {
        return reviewService.reply(id, reply.replace("\"", ""));
    }

    @PostMapping("/{id}/flag")
    public MessageResponse flag(@PathVariable Long id) {
        return reviewService.flag(id);
    }
}