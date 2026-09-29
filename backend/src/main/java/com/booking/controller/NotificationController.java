package com.booking.controller;

import com.booking.dto.response.NotificationResponse;
import com.booking.dto.response.UnreadResponse;
import com.booking.entity.Notification;
import com.booking.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public List<NotificationResponse> list() {
        return notificationService.listForUser(com.booking.security.SecurityUtils.currentUserId()).stream()
                .map(NotificationController::toResponse).toList();
    }

    @GetMapping("/unread-count")
    public UnreadResponse unread() {
        return new UnreadResponse(notificationService.unreadCount(com.booking.security.SecurityUtils.currentUserId()));
    }

    @PutMapping("/{id}/read")
    public void markRead(@PathVariable Long id) {
        notificationService.markRead(id, com.booking.security.SecurityUtils.currentUserId());
    }

    @PutMapping("/read-all")
    public void markAllRead() {
        notificationService.markAllRead(com.booking.security.SecurityUtils.currentUserId());
    }

    public static NotificationResponse toResponse(Notification n) {
        return new NotificationResponse(n.getId(), n.getTitle(), n.getMessage(), n.getType(), n.isRead(), n.getCreatedAt());
    }
}