package com.booking.service;

import com.booking.booking.SlotLockService;
import com.booking.entity.Appointment;
import com.booking.enums.AppointmentStatus;
import com.booking.repository.AppointmentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;

/** Background jobs: reminders (FR-34), releasing unpaid bookings and expired holds. */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchedulerJobs {

    private static final EnumSet<AppointmentStatus> REMINDABLE = EnumSet.of(AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED);

    private final AppointmentRepository appointmentRepository;
    private final AppointmentService appointmentService;
    private final NotificationService notificationService;
    private final SlotLockService slotLockService;
    private final Clock clock;

    /** 24h and 1h reminders; each is sent once per appointment (flags reset on reschedule). */
    @Scheduled(fixedDelayString = "${app.jobs.reminder-interval-ms:300000}", initialDelay = 30000)
    @Transactional
    public void sendReminders() {
        Instant now = clock.instant();
        List<Appointment> in24h = appointmentRepository.findStartingBetween(REMINDABLE, now, now.plus(Duration.ofHours(24)));
        int sent = 0;
        for (Appointment a : in24h) {
            long minutes = Duration.between(now, a.getStartAt()).toMinutes();
            if (minutes <= 60 && !a.isReminder1hSent()) {
                notificationService.reminder(a, 1);
                a.setReminder1hSent(true);
                a.setReminder24hSent(true);
                sent++;
            } else if (minutes > 60 && !a.isReminder24hSent()) {
                notificationService.reminder(a, 24);
                a.setReminder24hSent(true);
                sent++;
            }
        }
        if (sent > 0) log.info("Sent {} appointment reminders", sent);
    }

    @Scheduled(fixedDelayString = "${app.jobs.cleanup-interval-ms:60000}", initialDelay = 20000)
    public void releaseExpired() {
        int released = appointmentService.expireUnpaid();
        if (released > 0) log.info("Released {} unpaid bookings", released);
        slotLockService.purgeExpired();
    }
}
