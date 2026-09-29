package com.booking.service;

import com.booking.dto.response.NotificationResponse;
import com.booking.entity.Appointment;
import com.booking.entity.Notification;
import com.booking.entity.Staff;
import com.booking.entity.User;
import com.booking.enums.ActorType;
import com.booking.enums.NotifType;
import com.booking.enums.ServiceMode;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.messaging.EmailSender;
import com.booking.messaging.SmsSender;
import com.booking.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * In-app notification centre plus e-mail / SMS fan-out, honouring each user's channel
 * preferences (FR-24, FR-33, FR-34, FR-35).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);

    private final NotificationRepository notificationRepository;
    private final EmailSender emailSender;
    private final SmsSender smsSender;
    private final DtoMapper mapper;

    @Value("${app.app-url:http://localhost:5173}")
    private String appUrl;

    public enum Channel { IN_APP, EMAIL, SMS }

    @Transactional
    public void notify(User user, String title, String message, NotifType type, String link, Channel... channels) {
        if (user == null || user.isDeleted()) {
            return;
        }
        for (Channel ch : channels) {
            switch (ch) {
                case IN_APP -> notificationRepository.save(Notification.builder()
                        .user(user).title(title).message(message).type(type).link(link).build());
                case EMAIL -> {
                    if (user.isNotifEmail()) {
                        emailSender.send(user.getEmail(), title, "Hi " + user.getName() + ",\n\n" + message,
                                link == null ? null : "Open in app", link == null ? null : appUrl + link);
                    }
                }
                case SMS -> {
                    if (user.isNotifSms() && user.getPhone() != null) {
                        smsSender.send(user.getPhone(), title + ": " + message);
                    }
                }
            }
        }
    }

    public void inApp(User user, String title, String message, NotifType type, String link) {
        notify(user, title, message, type, link, Channel.IN_APP);
    }

    // ------------------------------------------------------------------ queries

    @Transactional(readOnly = true)
    public List<NotificationResponse> list(Long userId, int limit) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, Math.min(Math.max(limit, 1), 200)))
                .stream().map(mapper::notification).toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(Long userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(Long id, Long userId) {
        Notification n = notificationRepository.findById(id)
                .filter(x -> x.getUser().getId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("Notification not found"));
        n.setRead(true);
    }

    @Transactional
    public void markAllRead(Long userId) {
        notificationRepository.markAllRead(userId);
    }

    @Transactional
    public void delete(Long id, Long userId) {
        Notification n = notificationRepository.findById(id)
                .filter(x -> x.getUser().getId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("Notification not found"));
        notificationRepository.delete(n);
    }

    // ------------------------------------------------------------------ appointment events

    public static String when(Appointment a) {
        return a.getDate().format(DATE) + " at " + a.getStartTime().format(TIME) + " (" + a.getTimezone() + ")";
    }

    private static String what(Appointment a) {
        return a.getService().getName() + " with " + a.getProvider().getBusinessName()
                + (a.getStaff() != null ? " (" + a.getStaff().getName() + ")" : "");
    }

    private static String where(Appointment a) {
        if (a.getMode() == ServiceMode.ONLINE) {
            return "Online - join: " + a.getMeetingLink();
        }
        String addr = a.getProvider().getAddress();
        return addr == null ? "" : "Location: " + addr + (a.getProvider().getCity() == null ? "" : ", " + a.getProvider().getCity());
    }

    private void notifyProviderSide(Appointment a, String title, String message) {
        String link = "/dashboard/provider/appointments?ref=" + a.getBookingRef();
        notify(a.getProvider().getUser(), title, message, NotifType.BOOKING, link, Channel.IN_APP, Channel.EMAIL);
        Staff staff = a.getStaff();
        if (staff != null && staff.getUser() != null) {
            notify(staff.getUser(), title, message, NotifType.BOOKING, "/dashboard/staff", Channel.IN_APP, Channel.EMAIL);
        }
    }

    public void bookingCreated(Appointment a) {
        String custLink = "/appointments/" + a.getId();
        boolean confirmed = a.getStatus() == com.booking.enums.AppointmentStatus.CONFIRMED;
        String title = confirmed ? "Booking confirmed" : "Booking received";
        String msg = "Booking " + a.getBookingRef() + ": " + what(a) + " on " + when(a) + ". "
                + (confirmed ? "It is confirmed." : "We will let you know once it is confirmed.") + " " + where(a);
        notify(a.getCustomer(), title, msg.trim(), NotifType.BOOKING, custLink, Channel.IN_APP, Channel.EMAIL, Channel.SMS);
        notifyProviderSide(a, "New booking " + a.getBookingRef(),
                a.getCustomer().getName() + " booked " + a.getService().getName() + " on " + when(a) + "."
                        + (a.getNotes() == null || a.getNotes().isBlank() ? "" : " Notes: " + a.getNotes()));
    }

    public void bookingConfirmed(Appointment a) {
        notify(a.getCustomer(), "Booking confirmed",
                "Your booking " + a.getBookingRef() + " (" + what(a) + ") on " + when(a) + " is confirmed. " + where(a),
                NotifType.BOOKING, "/appointments/" + a.getId(), Channel.IN_APP, Channel.EMAIL, Channel.SMS);
    }

    public void paymentReceived(Appointment a, double amount, String currency) {
        notify(a.getCustomer(), "Payment received",
                "We received " + currency + " " + String.format("%.2f", amount) + " for booking " + a.getBookingRef() + ".",
                NotifType.PAYMENT, "/appointments/" + a.getId(), Channel.IN_APP, Channel.EMAIL);
    }

    public void bookingCancelled(Appointment a, double refundAmount) {
        String by = a.getCancelledBy() == ActorType.CUSTOMER ? "the customer"
                : a.getCancelledBy() == ActorType.SYSTEM ? "the system" : a.getProvider().getBusinessName();
        String reason = a.getCancelReason() == null || a.getCancelReason().isBlank() ? "" : " Reason: " + a.getCancelReason() + ".";
        String refund = refundAmount > 0 ? " A refund of " + String.format("%.2f", refundAmount) + " has been initiated." : "";
        notify(a.getCustomer(), "Booking cancelled",
                "Booking " + a.getBookingRef() + " (" + what(a) + ") on " + when(a) + " was cancelled by " + by + "." + reason + refund,
                NotifType.BOOKING, "/appointments/" + a.getId(), Channel.IN_APP, Channel.EMAIL, Channel.SMS);
        if (a.getCancelledBy() != ActorType.PROVIDER && a.getCancelledBy() != ActorType.STAFF) {
            notifyProviderSide(a, "Booking cancelled " + a.getBookingRef(),
                    "Booking " + a.getBookingRef() + " on " + when(a) + " was cancelled by " + by + "." + reason);
        }
    }

    public void bookingRescheduled(Appointment a, String previousWhen) {
        notify(a.getCustomer(), "Booking rescheduled",
                "Booking " + a.getBookingRef() + " moved from " + previousWhen + " to " + when(a) + ". " + where(a),
                NotifType.BOOKING, "/appointments/" + a.getId(), Channel.IN_APP, Channel.EMAIL, Channel.SMS);
        notifyProviderSide(a, "Booking rescheduled " + a.getBookingRef(),
                a.getCustomer().getName() + " moved " + a.getService().getName() + " from " + previousWhen + " to " + when(a) + ".");
    }

    public void statusChanged(Appointment a, String title, String message) {
        notify(a.getCustomer(), title, message, NotifType.BOOKING, "/appointments/" + a.getId(), Channel.IN_APP, Channel.EMAIL);
    }

    /** 24h reminders go by e-mail + SMS, 1h reminders by SMS (FR-33, FR-34). */
    public void reminder(Appointment a, int hours) {
        String msg = "Reminder: " + what(a) + " on " + when(a) + ". Booking " + a.getBookingRef() + ". " + where(a);
        if (hours >= 24) {
            notify(a.getCustomer(), "Upcoming appointment", msg, NotifType.REMINDER, "/appointments/" + a.getId(),
                    Channel.IN_APP, Channel.EMAIL, Channel.SMS);
        } else {
            notify(a.getCustomer(), "Appointment in 1 hour", msg, NotifType.REMINDER, "/appointments/" + a.getId(),
                    Channel.IN_APP, Channel.SMS);
        }
    }
}
