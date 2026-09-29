package com.booking.booking;

import com.booking.dto.response.SlotResponse;
import com.booking.dto.response.SlotsResponse;
import com.booking.entity.*;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.ProviderStatus;
import com.booking.enums.SlotStatus;
import com.booking.exception.ApiException;
import com.booking.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Computes bookable slots on the fly (FR-14..17, FR-20) from weekly hours, date overrides,
 * existing bookings (with buffers), checkout holds and capacity. Nothing is written, so
 * public slot queries have no side effects.
 *
 * <p>Resources: a service with assigned staff is booked against one staff member (capacity 1
 * each); a service without staff is booked against the provider itself with capacity
 * {@code maxBookingsPerSlot}. All times are local to the provider's timezone; comparisons use
 * instants, so DST gaps are skipped and overlaps are handled correctly (NFR-9).
 */
@Component
@RequiredArgsConstructor
public class SlotEngine {

    static final EnumSet<AppointmentStatus> ACTIVE =
            EnumSet.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED);

    private final ProviderRepository providerRepository;
    private final DomainServiceRepository serviceRepository;
    private final StaffRepository staffRepository;
    private final AvailabilityRepository availabilityRepository;
    private final BlockedDateRepository blockedDateRepository;
    private final AppointmentRepository appointmentRepository;
    private final SlotLockService slotLockService;
    private final Clock clock;

    /** One candidate start time, merged over all eligible resources. */
    public record Candidate(LocalDate date, LocalTime start, LocalTime end, Instant startAt, Instant endAt,
                            Instant busyUntil, SlotStatus status, List<Long> freeStaffIds, int remaining,
                            int nextSeat) {}

    public record Context(Provider provider, DomainService service, Staff staff) {}

    record Interval(Instant from, Instant to) {
        boolean overlaps(Instant a, Instant b) {
            return from.isBefore(b) && a.isBefore(to);
        }
    }

    /** Validates provider / service / staff for booking and returns them. */
    @Transactional(readOnly = true)
    public Context resolve(Long providerId, Long serviceId, Long staffId) {
        Provider p = providerRepository.findById(providerId)
                .filter(x -> x.getStatus() == ProviderStatus.VERIFIED)
                .orElseThrow(() -> ApiException.notFound("Provider not found or not accepting bookings"));
        DomainService s = serviceRepository.findById(serviceId)
                .filter(x -> x.getProvider().getId().equals(providerId) && x.isActive())
                .orElseThrow(() -> ApiException.badRequest("This service is not available for booking"));
        Staff staff = null;
        if (staffId != null) {
            staff = staffRepository.findByIdAndProviderId(staffId, providerId)
                    .filter(Staff::isActive)
                    .orElseThrow(() -> ApiException.badRequest("Staff member not available"));
            if (s.getStaff().isEmpty()) {
                throw ApiException.badRequest("This service is not booked with a specific staff member");
            }
            Long sid = staff.getId();
            if (s.getStaff().stream().noneMatch(x -> x.getId().equals(sid))) {
                throw ApiException.badRequest(staff.getName() + " does not offer this service");
            }
        }
        return new Context(p, s, staff);
    }

    @Transactional(readOnly = true)
    public SlotsResponse slots(Long providerId, Long serviceId, Long staffId, LocalDate date, Long viewerId) {
        Context ctx = resolve(providerId, serviceId, staffId);
        String closedMsg = checkDate(ctx, date);
        if (closedMsg != null) {
            return new SlotsResponse(providerId, serviceId, staffId, date, ctx.provider().getTimezone(), true, closedMsg, List.of());
        }
        List<Candidate> cands = compute(ctx, date, null, viewerId);
        List<SlotResponse> slots = cands.stream()
                .map(c -> new SlotResponse(c.date(), c.start(), c.end(), c.startAt(), c.status(), c.freeStaffIds(), c.remaining()))
                .toList();
        String msg = slots.isEmpty() ? "Not working on this day" :
                slots.stream().noneMatch(s -> s.status() == SlotStatus.AVAILABLE) ? "Fully booked" : null;
        return new SlotsResponse(providerId, serviceId, staffId, date, ctx.provider().getTimezone(), slots.isEmpty(), msg, slots);
    }

    /** Returns null if the date can be booked, otherwise a reason (past / beyond the booking window). */
    public String checkDate(Context ctx, LocalDate date) {
        LocalDate today = LocalDate.now(clock.withZone(ctx.provider().zone()));
        if (date.isBefore(today)) {
            return "Cannot book a date in the past";
        }
        int maxDays = ctx.service().getMaxAdvanceBookingDays() > 0
                ? ctx.service().getMaxAdvanceBookingDays() : ctx.provider().getMaxAdvanceBookingDays();
        if (date.isAfter(today.plusDays(maxDays))) {
            return "Bookings open up to " + maxDays + " days in advance";
        }
        return null;
    }

    /**
     * Finds one specific start time. If {@code preferredStaffId} is null and the service uses
     * staff, any free staff member may be chosen by the caller from {@code freeStaffIds}.
     */
    public Optional<Candidate> find(Context ctx, LocalDate date, LocalTime start, Long excludeAppointmentId, Long viewerId) {
        if (checkDate(ctx, date) != null) {
            return Optional.empty();
        }
        return compute(ctx, date, excludeAppointmentId, viewerId).stream()
                .filter(c -> c.start().equals(start) && c.status() == SlotStatus.AVAILABLE)
                .findFirst();
    }

    List<Candidate> compute(Context ctx, LocalDate date, Long excludeAppointmentId, Long viewerId) {
        Provider p = ctx.provider();
        DomainService svc = ctx.service();
        ZoneId zone = p.zone();
        int dow = date.getDayOfWeek().getValue();
        Instant earliest = clock.instant().plus(Duration.ofMinutes(p.getMinNoticeMin()));

        List<BlockedDate> blocks = blockedDateRepository.findByProviderIdAndDate(p.getId(), date);
        boolean providerClosed = blocks.stream().anyMatch(b -> b.getStaff() == null && !b.isAvailable() && b.getStartTime() == null);
        if (providerClosed) {
            return List.of();
        }
        BlockedDate providerCustom = blocks.stream()
                .filter(b -> b.getStaff() == null && b.isAvailable() && b.getStartTime() != null).findFirst().orElse(null);

        Instant dayFrom = date.atStartOfDay(zone).toInstant().minus(Duration.ofHours(12));
        Instant dayTo = date.plusDays(1).atStartOfDay(zone).toInstant().plus(Duration.ofHours(12));
        List<Appointment> busy = appointmentRepository.findOverlapping(p.getId(), ACTIVE, dayFrom, dayTo).stream()
                .filter(a -> excludeAppointmentId == null || !a.getId().equals(excludeAppointmentId))
                .toList();
        List<SlotLockService.Hold> holds = slotLockService.active(p.getId(), date).stream()
                .filter(h -> viewerId == null || !h.userId().equals(viewerId))
                .toList();

        boolean dayFull = false;
        if (p.getMaxBookingsPerDay() > 0) {
            long count = busy.stream().filter(a -> a.getDate().equals(date)).count();
            dayFull = count >= p.getMaxBookingsPerDay();
        }

        int step = p.getSlotIntervalMin() > 0 ? p.getSlotIntervalMin() : svc.getDurationMin() + svc.getBufferMin();
        step = Math.max(step, 5);

        // Resources to consider
        List<Staff> resources;
        boolean staffBased = !svc.getStaff().isEmpty();
        if (!staffBased) {
            resources = Collections.singletonList(null);
        } else if (ctx.staff() != null) {
            resources = List.of(ctx.staff());
        } else {
            resources = svc.getStaff().stream().filter(Staff::isActive)
                    .sorted(Comparator.comparing(Staff::getId)).toList();
        }

        // start time -> per-resource evaluation
        Map<LocalTime, List<Eval>> byStart = new TreeMap<>();
        for (Staff staff : resources) {
            Long staffId = staff == null ? null : staff.getId();
            boolean staffOff = staff != null && blocks.stream().anyMatch(b -> b.getStaff() != null
                    && b.getStaff().getId().equals(staffId) && !b.isAvailable() && b.getStartTime() == null);
            if (staffOff) continue;
            List<Interval> blocked = blocks.stream()
                    .filter(b -> !b.isAvailable() && b.getStartTime() != null)
                    .filter(b -> b.getStaff() == null || (staffId != null && b.getStaff().getId().equals(staffId)))
                    .map(b -> new Interval(toInstant(date, b.getStartTime(), zone), toInstant(date, b.getEndTime(), zone)))
                    .toList();
            int capacity = staff == null ? Math.max(1, p.getMaxBookingsPerSlot()) : 1;
            List<Appointment> resBusy = busy.stream()
                    .filter(a -> Objects.equals(a.getStaff() == null ? null : a.getStaff().getId(), staffId))
                    .toList();
            List<SlotLockService.Hold> resHolds = holds.stream().filter(h -> Objects.equals(h.staffId(), staffId)).toList();

            for (LocalTime[] w : windows(p, staff, dow, providerCustom, blocks, date)) {
                int startMin = w[0].toSecondOfDay() / 60;
                int endMin = w[1].equals(LocalTime.MAX) ? 24 * 60 : w[1].toSecondOfDay() / 60;
                for (int m = startMin; m + svc.getDurationMin() <= endMin; m += step) {
                    LocalTime t = LocalTime.ofSecondOfDay(m * 60L);
                    LocalDateTime ldt = date.atTime(t);
                    if (zone.getRules().getValidOffsets(ldt).isEmpty()) continue; // DST gap
                    Instant startAt = ldt.atZone(zone).toInstant();
                    if (startAt.isBefore(earliest)) continue;
                    Instant endAt = startAt.plus(Duration.ofMinutes(svc.getDurationMin()));
                    Instant busyUntil = endAt.plus(Duration.ofMinutes(svc.getBufferMin()));

                    SlotStatus status;
                    int remaining = 0;
                    int seat = 1;
                    if (dayFull) {
                        status = SlotStatus.BOOKED;
                    } else if (blocked.stream().anyMatch(i -> i.overlaps(startAt, busyUntil))) {
                        status = SlotStatus.BLOCKED;
                    } else {
                        List<Appointment> overlapping = resBusy.stream()
                                .filter(a -> a.getStartAt().isBefore(busyUntil) && startAt.isBefore(a.getBusyUntil()))
                                .toList();
                        long held = resHolds.stream()
                                .filter(h -> h.startAt().isBefore(busyUntil) && startAt.isBefore(h.endAt())).count();
                        remaining = (int) Math.max(0, capacity - overlapping.size() - held);
                        if (remaining > 0) {
                            status = SlotStatus.AVAILABLE;
                            Set<String> usedKeys = overlapping.stream().map(Appointment::getSlotKey)
                                    .filter(Objects::nonNull).collect(Collectors.toSet());
                            while (usedKeys.contains(slotKey(p.getId(), staffId, startAt, seat))) seat++;
                        } else {
                            status = overlapping.size() >= capacity ? SlotStatus.BOOKED : SlotStatus.HELD;
                        }
                    }
                    LocalTime end = LocalDateTime.ofInstant(endAt, zone).toLocalTime();
                    byStart.computeIfAbsent(t, k -> new ArrayList<>())
                            .add(new Eval(staffId, date, t, end, startAt, endAt, busyUntil, status, remaining, seat));
                }
            }
        }

        List<Candidate> result = new ArrayList<>();
        for (var e : byStart.entrySet()) {
            List<Eval> evals = e.getValue();
            List<Eval> free = evals.stream().filter(x -> x.status == SlotStatus.AVAILABLE).toList();
            Eval first = free.isEmpty() ? evals.get(0) : free.get(0);
            SlotStatus status;
            if (!free.isEmpty()) status = SlotStatus.AVAILABLE;
            else if (evals.stream().anyMatch(x -> x.status == SlotStatus.HELD)) status = SlotStatus.HELD;
            else if (evals.stream().allMatch(x -> x.status == SlotStatus.BLOCKED)) status = SlotStatus.BLOCKED;
            else status = SlotStatus.BOOKED;
            List<Long> freeStaff = staffBased ? free.stream().map(x -> x.staffId).toList() : List.of();
            int remaining = staffBased ? free.size() : first.remaining;
            result.add(new Candidate(first.date, first.start, first.end, first.startAt, first.endAt, first.busyUntil,
                    status, freeStaff, remaining, first.seat));
        }
        return result;
    }

    private record Eval(Long staffId, LocalDate date, LocalTime start, LocalTime end, Instant startAt, Instant endAt,
                        Instant busyUntil, SlotStatus status, int remaining, int seat) {}

    /** Working windows for a resource on a date: staff-specific overrides > staff weekly > provider. */
    private List<LocalTime[]> windows(Provider p, Staff staff, int dow, BlockedDate providerCustom,
                                      List<BlockedDate> blocks, LocalDate date) {
        if (staff != null) {
            Optional<BlockedDate> staffCustom = blocks.stream()
                    .filter(b -> b.getStaff() != null && b.getStaff().getId().equals(staff.getId())
                            && b.isAvailable() && b.getStartTime() != null)
                    .findFirst();
            if (staffCustom.isPresent()) {
                return List.<LocalTime[]>of(new LocalTime[]{staffCustom.get().getStartTime(), staffCustom.get().getEndTime()});
            }
            List<Availability> own = availabilityRepository
                    .findByProviderIdAndStaffIdAndDayOfWeekAndActiveTrue(p.getId(), staff.getId(), dow);
            if (!own.isEmpty()) {
                return own.stream().map(a -> new LocalTime[]{a.getStartTime(), a.getEndTime()}).toList();
            }
        }
        if (providerCustom != null) {
            return List.<LocalTime[]>of(new LocalTime[]{providerCustom.getStartTime(), providerCustom.getEndTime()});
        }
        return availabilityRepository.findByProviderIdAndStaffIsNullAndDayOfWeekAndActiveTrue(p.getId(), dow).stream()
                .sorted(Comparator.comparing(Availability::getStartTime))
                .map(a -> new LocalTime[]{a.getStartTime(), a.getEndTime()})
                .toList();
    }

    public static Instant toInstant(LocalDate date, LocalTime time, ZoneId zone) {
        return date.atTime(time).atZone(zone).toInstant();
    }

    /** Key that is unique per occupied seat (resource + start + seat), enforced by a DB constraint. */
    public static String slotKey(Long providerId, Long staffId, Instant startAt, int seat) {
        return staffId != null
                ? "S" + staffId + "@" + startAt.getEpochSecond()
                : "P" + providerId + "@" + startAt.getEpochSecond() + "#" + seat;
    }
}
