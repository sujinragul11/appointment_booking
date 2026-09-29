package com.booking.service;

import com.booking.dto.request.AvailabilityRequest;
import com.booking.dto.request.OverrideRequest;
import com.booking.dto.request.SlotBlockRequest;
import com.booking.dto.response.*;
import com.booking.entity.*;
import com.booking.enums.SlotStatus;
import com.booking.exception.ApiException;
import com.booking.repository.*;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AvailabilityService {

    private final ProviderRepository providerRepository;
    private final AvailabilityRepository availabilityRepository;
    private final AvailabilityOverrideRepository overrideRepository;
    private final SlotRepository slotRepository;
    private final DomainServiceRepository serviceRepository;
    private final StaffRepository staffRepository;

    public AvailabilityBundleResponse getBundle(Long providerId) {
        Provider p = providerRepository.findById(providerId)
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        List<AvailabilityResponse> avail = availabilityRepository.findByProviderId(providerId).stream()
                .map(this::toAvailResponse).toList();
        List<OverrideResponse> overrides = overrideRepository.findByProviderId(providerId).stream()
                .map(this::toOverrideResponse).toList();
        return new AvailabilityBundleResponse(p.getId(), p.getBusinessName(), avail, overrides);
    }

    @Transactional
    public AvailabilityResponse save(AvailabilityRequest req) {
        Provider p = provider();
        Availability existing = null;
        if (req.staffId() != null) {
            existing = availabilityRepository.findByProviderId(p.getId())
                    .stream().filter(a -> req.staffId().equals(a.getStaff() != null ? a.getStaff().getId() : null) && a.getDayOfWeek() == req.dayOfWeek())
                    .findFirst().orElse(null);
        } else {
            existing = availabilityRepository.findByProviderIdAndStaffIsNull(p.getId())
                    .stream().filter(a -> a.getDayOfWeek() == req.dayOfWeek())
                    .findFirst().orElse(null);
        }
        if (existing == null) {
            Staff staff = req.staffId() == null ? null :
                    staffRepository.findByIdAndProviderId(req.staffId(), p.getId())
                            .orElseThrow(() -> ApiException.badRequest("Staff not found for this provider"));
            existing = Availability.builder().provider(p).staff(staff).build();
        }
        existing.setDayOfWeek(req.dayOfWeek());
        existing.setStartTime(req.startTime());
        existing.setEndTime(req.endTime());
        existing.setActive(req.active() == null || req.active());
        return toAvailResponse(availabilityRepository.save(existing));
    }

    @Transactional
    public void deleteAvailability(Long id) {
        Availability a = availabilityRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Availability not found"));
        if (!a.getProvider().getId().equals(provider().getId())) {
            throw ApiException.forbidden("Not your availability");
        }
        availabilityRepository.deleteById(id);
    }

    @Transactional
    public OverrideResponse addOverride(OverrideRequest req) {
        Provider p = provider();
        overrideRepository.findByProviderIdAndDate(p.getId(), req.date()).ifPresent(overrideRepository::delete);
        AvailabilityOverride o = AvailabilityOverride.builder()
                .provider(p)
                .date(req.date())
                .startTime(req.startTime())
                .endTime(req.endTime())
                .available(req.isAvailable() == null || req.isAvailable())
                .reason(req.reason())
                .build();
        return toOverrideResponse(overrideRepository.save(o));
    }

    @Transactional
    public void deleteOverride(Long id) {
        AvailabilityOverride o = overrideRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Override not found"));
        if (!o.getProvider().getId().equals(provider().getId())) {
            throw ApiException.forbidden("Not your override");
        }
        overrideRepository.deleteById(id);
    }

    @Transactional
    public List<SlotResponse> blockSlots(SlotBlockRequest req) {
        Provider p = provider();
        List<SlotResponse> blocked = new ArrayList<>();
        List<Slot> existing = slotRepository.findByProviderIdAndDateOrderByStartTimeAsc(p.getId(), req.date());
        LocalTime t = req.startTime();
        while (t.isBefore(req.endTime())) {
            LocalTime stepEnd = t.plusMinutes(30);
            LocalTime slotStart = t;
            Slot slot = existing.stream()
                    .filter(s -> s.getStartTime().equals(slotStart) && Objects.equals(s.getStaffId(), req.staffId()))
                    .findFirst().orElse(null);
            if (slot == null) {
                slot = Slot.builder()
                        .provider(p)
                        .date(req.date())
                        .startTime(slotStart)
                        .endTime(stepEnd)
                        .staffId(req.staffId())
                        .status(SlotStatus.BLOCKED)
                        .build();
            } else {
                slot.setStatus(SlotStatus.BLOCKED);
            }
            blocked.add(toSlotResponse(slotRepository.save(slot)));
            t = stepEnd;
        }
        return blocked;
    }

    /**
     * Generates (and persists) slots for a given provider+service(+staff) on a date,
     * honouring recurring availability, custom overrides, buffer times and blocked slots.
     */
    @Transactional
    public List<SlotResponse> generateSlots(Long providerId, Long serviceId, Long staffId, LocalDate date) {
        Provider p = providerRepository.findById(providerId)
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        DomainService svc = serviceRepository.findById(serviceId)
                .filter(s -> s.getProvider().getId().equals(providerId) && s.isActive())
                .orElseThrow(() -> ApiException.badRequest("Service unavailable"));

        if (date.isBefore(LocalDate.now())) {
            throw ApiException.badRequest("Cannot book a date in the past");
        }
        int maxDays = svc.getMaxAdvanceBookingDays() > 0 ? svc.getMaxAdvanceBookingDays() : p.getMaxAdvanceBookingDays();
        if (date.isAfter(LocalDate.now().plusDays(maxDays))) {
            throw ApiException.badRequest("Date exceeds provider's max advance booking window (" + maxDays + " days)");
        }

        AvailabilityOverride override = overrideRepository.findByProviderIdAndDate(providerId, date).orElse(null);
        if (override != null && !override.isAvailable()) {
            return List.of();
        }

        // Resolve slots -> name/dayOfWeek for conflict resolution.
        Map<LocalTime, Slot> existingByStart = slotRepository
                .findByProviderIdAndDateOrderByStartTimeAsc(providerId, date).stream()
                .filter(s -> serviceId != null && (s.getServiceId() == null || s.getServiceId().longValue() == serviceId))
                .collect(Collectors.toMap(Slot::getStartTime, s -> s, (a, b) -> a));

        int dow = date.getDayOfWeek().getValue();
        List<AvailabilityWindow> windows = resolveWindows(p, staffId, dow, override);

        int duration = svc.getDurationMin();
        int step = duration + svc.getBufferMin();

        List<Slot> result = new ArrayList<>();
        Set<LocalTime> added = new HashSet<>();
        for (AvailabilityWindow w : windows) {
            LocalTime t = w.start();
            while (!t.plusMinutes(duration).isAfter(w.end())) {
                boolean past = date.equals(LocalDate.now())
                        && (t.isBefore(LocalTime.now().minusMinutes(15)));
                Slot slot = existingByStart.get(t);
                if (slot == null && !past && added.add(t)) {
                    Slot created = Slot.builder()
                            .provider(p)
                            .serviceId(serviceId)
                            .staffId(staffId)
                            .date(date)
                            .startTime(t)
                            .endTime(t.plusMinutes(duration))
                            .status(SlotStatus.AVAILABLE)
                            .build();
                    result.add(slotRepository.save(created));
                } else if (slot != null && slot.getStatus() == SlotStatus.AVAILABLE && !past) {
                    slot.setServiceId(serviceId);
                    result.add(slotRepository.save(slot));
                    added.add(t);
                }
                t = t.plusMinutes(Math.max(step, 1));
            }
        }
        result.sort(Comparator.comparing(Slot::getStartTime));
        return result.stream().map(this::toSlotResponse).toList();
    }

    private record AvailabilityWindow(LocalTime start, LocalTime end) {
    }

    private List<AvailabilityWindow> resolveWindows(Provider p, Long staffId, int dow,
                                                    AvailabilityOverride override) {
        List<Availability> rows;
        if (staffId != null) {
            rows = availabilityRepository.findByProviderIdAndStaffId(p.getId(), staffId).stream()
                    .filter(a -> a.getDayOfWeek() == dow && a.isActive())
                    .collect(Collectors.toList());
            if (rows.isEmpty()) {
                rows = availabilityRepository.findByProviderIdAndStaffIsNull(p.getId()).stream()
                        .filter(a -> a.getDayOfWeek() == dow && a.isActive())
                        .collect(Collectors.toList());
            }
        } else {
            rows = availabilityRepository.findByProviderIdAndStaffIsNull(p.getId()).stream()
                    .filter(a -> a.getDayOfWeek() == dow && a.isActive())
                    .collect(Collectors.toList());
        }
        if (override != null && override.isAvailable()) {
            if (override.getStartTime() != null && override.getEndTime() != null) {
                return List.of(new AvailabilityWindow(override.getStartTime(), override.getEndTime()));
            }
        }
        return rows.stream().map(a -> new AvailabilityWindow(a.getStartTime(), a.getEndTime())).toList();
    }

    private Provider provider() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    private AvailabilityResponse toAvailResponse(Availability a) {
        return new AvailabilityResponse(a.getId(), a.getProvider().getId(),
                a.getStaff() == null ? null : a.getStaff().getId(),
                a.getDayOfWeek(), BookingUtils.dayName(a.getDayOfWeek()),
                a.getStartTime(), a.getEndTime(), a.isActive());
    }

    private OverrideResponse toOverrideResponse(AvailabilityOverride o) {
        return new OverrideResponse(o.getId(), o.getProvider().getId(), o.getDate(),
                o.getStartTime(), o.getEndTime(), o.isAvailable(), o.getReason());
    }

    private SlotResponse toSlotResponse(Slot s) {
        return new SlotResponse(s.getId(), s.getProvider().getId(), s.getServiceId(), s.getStaffId(),
                s.getDate(), s.getStartTime(), s.getEndTime(), s.getStatus());
    }
}