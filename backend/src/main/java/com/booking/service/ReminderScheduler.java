package com.booking.service;

import com.booking.entity.Appointment;
import com.booking.enums.AppointmentStatus;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.SlotRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReminderScheduler {

    private final AppointmentRepository appointmentRepository;
    private final SlotRepository slotRepository;
    private final NotificationService notificationService;

    /** Runs every 10 minutes; sends 24h and 1h reminders for confirmed appointments. */
    @Scheduled(fixedDelay = 600000)
    public void sendReminders() {
        try {
            LocalDateTime now = LocalDateTime.now();
            appointmentRepository.findByStatus(AppointmentStatus.CONFIRMED)
                    .forEach(a -> {
                        Duration until = Duration.between(now, LocalDateTime.of(a.getDate(), a.getStartTime()));
                        long minutes = until.toMinutes();
                        if (minutes >= 23 * 60 + 50 && minutes <= 24 * 60 + 10) {
                            notificationService.reminder(a, 24);
                        } else if (minutes >= 50 && minutes <= 70) {
                            notificationService.reminder(a, 1);
                        }
                    });
            slotRepository.deleteByDateBefore(LocalDate.now().minusDays(2));
        } catch (Exception e) {
            log.warn("Reminder scheduler failed: {}", e.getMessage());
        }
    }
}