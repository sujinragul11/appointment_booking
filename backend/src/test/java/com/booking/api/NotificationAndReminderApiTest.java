package com.booking.api;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.NotificationResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Notification;
import com.booking.entity.Provider;
import com.booking.entity.SlotHold;
import com.booking.entity.User;
import com.booking.enums.NotifType;
import com.booking.enums.PaymentMethod;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.NotificationRepository;
import com.booking.repository.SlotHoldRepository;
import com.booking.service.NotificationService;
import com.booking.service.SchedulerJobs;
import com.booking.support.IntegrationTestBase;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Notification centre API, channel preferences, and the reminder / cleanup jobs driven by the test clock. */
class NotificationAndReminderApiTest extends IntegrationTestBase {

    @Autowired private NotificationRepository notificationRepository;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private SlotHoldRepository slotHoldRepository;
    @Autowired private NotificationService notificationService;
    @Autowired private SchedulerJobs schedulerJobs;

    private Provider provider;
    private DomainService service;
    private User customer;
    private String customerToken;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        provider = data.provider();
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        service = data.service(provider, "Consultation", 30, 0, 1000);
        customer = data.customer();
        customerToken = auth.token(customer);
        day = inDays(2); // bookings at 10:00 start at 2030-01-09T10:00Z
    }

    private Notification notification(User user, String title) {
        return notificationRepository.save(Notification.builder().user(user).title(title).message(title + " body")
                .type(NotifType.INFO).link("/somewhere").build());
    }

    private long count(User user, String title) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId(), PageRequest.of(0, 200)).stream()
                .filter(n -> n.getTitle().equals(title)).count();
    }

    // ------------------------------------------------------------------ notification centre

    @Test
    void notificationsCanBeListedReadAndDeleted() throws Exception {
        Notification first = notification(customer, "First");
        Notification second = notification(customer, "Second");
        notification(customer, "Third");
        Notification foreign = notification(data.customer(), "Not yours");

        List<NotificationResponse> all = read(get("/api/notifications", customerToken).andExpect(status().isOk()),
                new TypeReference<>() { });
        assertThat(all).extracting(NotificationResponse::title).containsExactlyInAnyOrder("First", "Second", "Third");
        assertThat(all).allMatch(n -> !n.read() && n.type() == NotifType.INFO && "/somewhere".equals(n.link()));
        assertThat(read(get("/api/notifications?limit=2", customerToken), new TypeReference<List<NotificationResponse>>() { }))
                .hasSize(2);
        get("/api/notifications/unread-count", customerToken).andExpect(jsonPath("$.unread").value(3));

        put("/api/notifications/" + first.getId() + "/read", customerToken, null).andExpect(status().isNoContent());
        get("/api/notifications/unread-count", customerToken).andExpect(jsonPath("$.unread").value(2));
        put("/api/notifications/" + foreign.getId() + "/read", customerToken, null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Notification not found"));

        put("/api/notifications/read-all", customerToken, null).andExpect(status().isNoContent());
        get("/api/notifications/unread-count", customerToken).andExpect(jsonPath("$.unread").value(0));
        assertThat(notificationRepository.findById(foreign.getId()).orElseThrow().isRead()).isFalse();

        delete("/api/notifications/" + second.getId(), customerToken).andExpect(status().isNoContent());
        delete("/api/notifications/" + second.getId(), customerToken).andExpect(status().isNotFound());
        delete("/api/notifications/" + foreign.getId(), customerToken).andExpect(status().isNotFound());
        assertThat(read(get("/api/notifications", customerToken), new TypeReference<List<NotificationResponse>>() { }))
                .extracting(NotificationResponse::title).containsExactlyInAnyOrder("First", "Third");

        get("/api/notifications", null).andExpect(status().isUnauthorized());
    }

    @Test
    void channelPreferencesAreHonoured() throws Exception {
        data.updateUser(customer.getId(), u -> { u.setNotifEmail(false); u.setNotifSms(false); });

        AppointmentResponse a = book(customerToken, provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);

        assertThat(count(customer, "Booking confirmed")).as("in-app is always kept").isEqualTo(1);
        verify(emailSender, never()).send(eq(customer.getEmail()), anyString(), any(), any(), any());
        verify(smsSender, never()).send(eq(customer.getPhone()), anyString());
        verify(emailSender).send(eq(provider.getUser().getEmail()), eq("New booking " + a.bookingRef()), any(), any(), any());
    }

    @Test
    void deletedUsersReceiveNothing() {
        User gone = data.customer();
        User deleted = data.updateUser(gone.getId(), u -> u.setDeleted(true));

        notificationService.notify(deleted, "Hello", "Nobody home", NotifType.INFO, null,
                NotificationService.Channel.IN_APP, NotificationService.Channel.EMAIL, NotificationService.Channel.SMS);
        notificationService.notify(null, "Hello", "Nobody", NotifType.INFO, null, NotificationService.Channel.IN_APP);

        assertThat(count(gone, "Hello")).isZero();
        verify(emailSender, never()).send(any(), eq("Hello"), any(), any(), any());
    }

    // ------------------------------------------------------------------ reminders

    @Test
    void remindersAreSentOnceAt24HoursAndOnceAt1Hour() throws Exception {
        AppointmentResponse a = book(customerToken, provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        // not remindable: unpaid online booking (PENDING) and a cancelled one
        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "11:00", PaymentMethod.RAZORPAY);
        User other = data.customer();
        AppointmentResponse cancelled = book(auth.token(other), provider.getId(), service.getId(), day, "12:00",
                PaymentMethod.PAY_AT_VENUE);
        put("/api/appointments/" + cancelled.id() + "/cancel", auth.token(other), Map.of("reason", "x")).andExpect(status().isOk());

        schedulerJobs.sendReminders(); // 48h before: nothing yet
        assertThat(count(customer, "Upcoming appointment")).isZero();

        clock.setInstant(Instant.parse("2030-01-08T11:00:00Z")); // 23h before
        schedulerJobs.sendReminders();
        schedulerJobs.sendReminders();
        assertThat(count(customer, "Upcoming appointment")).isEqualTo(1);
        assertThat(count(customer, "Appointment in 1 hour")).isZero();
        assertThat(count(other, "Upcoming appointment")).isZero();
        verify(emailSender, times(1)).send(eq(customer.getEmail()), eq("Upcoming appointment"), any(), any(), any());
        verify(smsSender, times(1)).send(eq(customer.getPhone()), startsWith("Upcoming appointment: Reminder: Consultation"));
        var stored = appointmentRepository.findById(a.id()).orElseThrow();
        assertThat(stored.isReminder24hSent()).isTrue();
        assertThat(stored.isReminder1hSent()).isFalse();

        clock.setInstant(Instant.parse("2030-01-09T09:10:00Z")); // 50 minutes before
        schedulerJobs.sendReminders();
        schedulerJobs.sendReminders();
        assertThat(count(customer, "Appointment in 1 hour")).isEqualTo(1);
        assertThat(count(customer, "Upcoming appointment")).isEqualTo(1);
        verify(smsSender, times(1)).send(eq(customer.getPhone()), startsWith("Appointment in 1 hour"));
        verify(emailSender, never()).send(eq(customer.getEmail()), eq("Appointment in 1 hour"), any(), any(), any());
        assertThat(appointmentRepository.findById(a.id()).orElseThrow().isReminder1hSent()).isTrue();

        // a reschedule resets the flags, so the new time is reminded again
        patch("/api/appointments/" + a.id() + "/reschedule", auth.token(provider.getUser()),
                Map.of("date", day.toString(), "startTime", "15:00")).andExpect(status().isOk());
        clock.setInstant(Instant.parse("2030-01-09T14:15:00Z"));
        schedulerJobs.sendReminders();
        assertThat(count(customer, "Appointment in 1 hour")).isEqualTo(2);
        assertThat(count(customer, "Upcoming appointment")).as("inside one hour only the short reminder goes out").isEqualTo(1);

        // started appointments are not reminded any more
        clock.setInstant(Instant.parse("2030-01-09T15:05:00Z"));
        schedulerJobs.sendReminders();
        assertThat(count(customer, "Appointment in 1 hour")).isEqualTo(2);
    }

    @Test
    void appointmentBookedInsideTheLastHourOnlyGetsTheShortReminder() throws Exception {
        AppointmentResponse a = book(customerToken, provider.getId(), service.getId(), day, "12:00", PaymentMethod.PAY_AT_VENUE);
        clock.setInstant(Instant.parse("2030-01-09T11:30:00Z"));

        schedulerJobs.sendReminders();

        assertThat(count(customer, "Appointment in 1 hour")).isEqualTo(1);
        assertThat(count(customer, "Upcoming appointment")).isZero();
        var stored = appointmentRepository.findById(a.id()).orElseThrow();
        assertThat(stored.isReminder24hSent()).isTrue();
        assertThat(stored.isReminder1hSent()).isTrue();
    }

    // ------------------------------------------------------------------ cleanup job

    @Test
    void cleanupJobPurgesExpiredHolds() {
        SlotHold expired = slotHoldRepository.save(SlotHold.builder().token("expired-token").providerId(provider.getId())
                .serviceId(service.getId()).userId(customer.getId()).date(day).startTime(LocalTime.of(10, 0))
                .startAt(Instant.parse("2030-01-09T10:00:00Z")).endAt(Instant.parse("2030-01-09T10:30:00Z"))
                .expiresAt(Instant.now().minusSeconds(60)).build());
        SlotHold live = slotHoldRepository.save(SlotHold.builder().token("live-token").providerId(provider.getId())
                .serviceId(service.getId()).userId(customer.getId()).date(day).startTime(LocalTime.of(11, 0))
                .startAt(Instant.parse("2030-01-09T11:00:00Z")).endAt(Instant.parse("2030-01-09T11:30:00Z"))
                .expiresAt(Instant.now().plusSeconds(600)).build());

        schedulerJobs.releaseExpired();

        assertThat(slotHoldRepository.existsById(expired.getId())).isFalse();
        assertThat(slotHoldRepository.existsById(live.getId())).isTrue();
    }
}
