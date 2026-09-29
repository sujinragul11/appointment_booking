package com.booking.service;

import com.booking.entity.Appointment;
import com.booking.entity.Notification;
import com.booking.entity.User;
import com.booking.enums.NotifType;
import com.booking.repository.NotificationRepository;
import com.booking.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    @Transactional
    public void notifyUser(Long userId, String title, String message, NotifType type) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return;
        }
        Notification n = Notification.builder()
                .user(user)
                .title(title)
                .message(message)
                .type(type)
                .build();
        notificationRepository.save(n);
        log.info("[NOTIF:{}] {} → {} ({})", type, title, user.getEmail(), message);
        sendEmailMock(user, title, message);
    }

    private void sendEmailMock(User user, String subject, String body) {
        log.info("[EMAIL] to={} subject={} body={}", user.getEmail(), subject, body);
    }

    @Transactional
    public List<Notification> listForUser(Long userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public long unreadCount(Long userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(Long nId, Long userId) {
        Notification n = notificationRepository.findById(nId)
                .orElseThrow(() -> com.booking.exception.ApiException.notFound("Notification not found"));
        if (!n.getUser().getId().equals(userId)) {
            throw com.booking.exception.ApiException.forbidden("Not your notification");
        }
        n.setRead(true);
        notificationRepository.save(n);
    }

    @Transactional
    public void markAllRead(Long userId) {
        notificationRepository.findByUserIdAndReadFalseOrderByCreatedAtDesc(userId)
                .forEach(n -> n.setRead(true));
    }

    public void bookingCreated(Appointment a) {
        notifyUser(a.getCustomer().getId(), "Booking received",
                "Your booking " + a.getBookingRef() + " for " + a.getService().getName()
                        + " on " + a.getDate() + " at " + a.getStartTime() + " has been received.", NotifType.BOOKING);
        notifyUser(a.getProvider().getUser().getId(), "New booking",
                "New booking " + a.getBookingRef() + " from " + a.getCustomer().getName()
                        + " — " + a.getService().getName() + " on " + a.getDate() + " at " + a.getStartTime() + ".", NotifType.BOOKING);
    }

    public void bookingConfirmed(Appointment a) {
        notifyUser(a.getCustomer().getId(), "Booking confirmed",
                "Your booking " + a.getBookingRef() + " is confirmed. See you on " + a.getDate() + " at " + a.getStartTime() + "." , NotifType.BOOKING);
    }

    public void bookingCancelled(Appointment a) {
        notifyUser(a.getCustomer().getId(), "Booking cancelled",
                "Your booking " + a.getBookingRef() + " has been cancelled." + (a.getCancelReason() == null ? "" : " Reason: " + a.getCancelReason()), NotifType.BOOKING);
        notifyUser(a.getProvider().getUser().getId(), "Booking cancelled",
                "Booking " + a.getBookingRef() + " was cancelled by the customer.", NotifType.BOOKING);
    }

    public void reminder(Appointment a, int hours) {
        notifyUser(a.getCustomer().getId(), "Appointment reminder (" + hours + "h)",
                "Reminder: " + a.getService().getName() + " at " + a.getProvider().getBusinessName()
                        + " on " + a.getDate() + " at " + a.getStartTime() + ".", NotifType.REMINDER);
    }
}