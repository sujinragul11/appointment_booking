package com.booking.controller;

import com.booking.dto.request.AddressRequest;
import com.booking.dto.request.FlagRequest;
import com.booking.dto.request.ReviewRequest;
import com.booking.dto.response.*;
import com.booking.security.SecurityUtils;
import com.booking.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Signed-in user features: notifications (FR-35), addresses, reviews (FR-41), uploads. */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Account")
public class AccountController {

    private final NotificationService notificationService;
    private final AddressService addressService;
    private final ReviewService reviewService;
    private final UploadService uploadService;

    @GetMapping("/notifications")
    public List<NotificationResponse> notifications(@RequestParam(defaultValue = "50") int limit) {
        return notificationService.list(SecurityUtils.currentUserId(), limit);
    }

    @GetMapping("/notifications/unread-count")
    public UnreadResponse unread() {
        return new UnreadResponse(notificationService.unreadCount(SecurityUtils.currentUserId()));
    }

    @PutMapping("/notifications/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable Long id) {
        notificationService.markRead(id, SecurityUtils.currentUserId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/notifications/read-all")
    public ResponseEntity<Void> markAllRead() {
        notificationService.markAllRead(SecurityUtils.currentUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/notifications/{id}")
    public ResponseEntity<Void> deleteNotification(@PathVariable Long id) {
        notificationService.delete(id, SecurityUtils.currentUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/addresses")
    public List<AddressResponse> addresses() {
        return addressService.list();
    }

    @PostMapping("/addresses")
    public AddressResponse addAddress(@Valid @RequestBody AddressRequest request) {
        return addressService.add(request);
    }

    @DeleteMapping("/addresses/{id}")
    public ResponseEntity<Void> deleteAddress(@PathVariable Long id) {
        addressService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reviews")
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Rate (1-5) and review a completed appointment (FR-41, FR-42)")
    public ReviewResponse review(@Valid @RequestBody ReviewRequest request) {
        return reviewService.create(request);
    }

    @PostMapping("/reviews/{id}/flag")
    @Operation(summary = "Report a review for moderation")
    public MessageResponse flag(@PathVariable Long id, @Valid @RequestBody(required = false) FlagRequest request) {
        reviewService.flag(id, request == null ? null : request.reason());
        return new MessageResponse("Thanks - the review will be checked by our team");
    }

    @PostMapping(value = "/uploads", consumes = "multipart/form-data")
    @Operation(summary = "Upload an image (PNG/JPEG/WebP/GIF, max 2 MB)")
    public UploadResponse upload(@RequestParam("file") MultipartFile file) {
        return uploadService.store(file);
    }
}
