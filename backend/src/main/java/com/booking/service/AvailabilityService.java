package com.booking.service;

import com.booking.dto.request.AvailabilityRequest;
import com.booking.dto.request.BlockDateRequest;
import com.booking.dto.request.WeeklyAvailabilityRequest;
import com.booking.dto.response.AvailabilityBundleResponse;
import com.booking.dto.response.AvailabilityResponse;
import com.booking.dto.response.BlockedDateResponse;
import com.booking.entity.Availability;
import com.booking.entity.BlockedDate;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.AvailabilityRepository;
import com.booking.repository.BlockedDateRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.StaffRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Weekly working hours (FR-14) and blocked dates / custom hours (FR-15). Providers manage
 * their whole team; a STAFF user manages only their own hours.
 */
@Service
@RequiredArgsConstructor
public class AvailabilityService {

    private final ProviderRepository providerRepository;
    private final StaffRepository staffRepository;
    private final AvailabilityRepository availabilityRepository;
    private final BlockedDateRepository blockedDateRepository;
    private final AuditService auditService;
    private final DtoMapper mapper;

    @Transactional(readOnly = true)
    public AvailabilityBundleResponse publicBundle(Long providerId) {
        Provider p = providerRepository.findById(providerId)
                .filter(x -> x.getStatus() == ProviderStatus.VERIFIED)
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        return bundle(p, true);
    }

    @Transactional(readOnly = true)
    public AvailabilityBundleResponse mine() {
        Scope s = scope(null);
        AvailabilityBundleResponse b = bundle(s.provider(), false);
        if (s.ownStaff() == null) return b;
        Long sid = s.ownStaff().getId();
        return new AvailabilityBundleResponse(b.providerId(), b.businessName(), b.timezone(),
                b.availability().stream().filter(a -> a.staffId() == null || a.staffId().equals(sid)).toList(),
                b.blockedDates().stream().filter(d -> d.staffId() == null || d.staffId().equals(sid)).toList());
    }

    private AvailabilityBundleResponse bundle(Provider p, boolean publicView) {
        List<AvailabilityResponse> avail = availabilityRepository.findByProviderIdOrderByDayOfWeekAscStartTimeAsc(p.getId())
                .stream().filter(a -> !publicView || a.isActive()).map(mapper::availability).toList();
        List<BlockedDateResponse> blocked = blockedDateRepository
                .findByProviderIdAndDateGreaterThanEqualOrderByDateAsc(p.getId(), LocalDate.now(p.zone()).minusDays(publicView ? 0 : 30))
                .stream().map(mapper::blockedDate)
                // customers only need to know when the provider is closed; reasons stay private
                .map(d -> publicView ? new BlockedDateResponse(d.id(), d.providerId(), d.staffId(), d.date(), d.startTime(),
                        d.endTime(), d.available(), null) : d)
                .toList();
        return new AvailabilityBundleResponse(p.getId(), p.getBusinessName(), p.getTimezone(), avail, blocked);
    }

    /** Adds one weekly window. Overlapping windows for the same day and resource are rejected. */
    @Transactional
    public AvailabilityResponse add(AvailabilityRequest req) {
        Scope s = scope(req.staffId());
        Staff staff = s.targetStaff();
        List<Availability> sameDay = availabilityRepository.findByProviderIdOrderByDayOfWeekAscStartTimeAsc(s.provider().getId())
                .stream().filter(a -> a.getDayOfWeek() == req.dayOfWeek() && Objects.equals(staffId(a.getStaff()), staffId(staff)))
                .toList();
        if (sameDay.stream().anyMatch(a -> a.getStartTime().isBefore(req.endTime()) && req.startTime().isBefore(a.getEndTime()))) {
            throw ApiException.conflict("This window overlaps existing hours on that day");
        }
        Availability a = availabilityRepository.save(Availability.builder()
                .provider(s.provider()).staff(staff).dayOfWeek(req.dayOfWeek())
                .startTime(req.startTime()).endTime(req.endTime())
                .active(req.active() == null || req.active()).build());
        auditService.record("AVAILABILITY_ADDED", "Availability", a.getId(), describe(a));
        return mapper.availability(a);
    }

    /** Replaces all weekly windows of the provider-level schedule or one staff member. */
    @Transactional
    public List<AvailabilityResponse> replaceWeek(WeeklyAvailabilityRequest req) {
        Scope s = scope(req.staffId());
        Staff staff = s.targetStaff();
        var windows = new ArrayList<>(req.windows());
        windows.sort(Comparator.comparingInt(WeeklyAvailabilityRequest.Window::dayOfWeek)
                .thenComparing(WeeklyAvailabilityRequest.Window::startTime));
        for (int i = 1; i < windows.size(); i++) {
            var prev = windows.get(i - 1);
            var cur = windows.get(i);
            if (prev.dayOfWeek() == cur.dayOfWeek() && cur.startTime().isBefore(prev.endTime())) {
                throw ApiException.badRequest("Windows overlap on " + com.booking.util.BookingUtils.dayName(cur.dayOfWeek()));
            }
        }
        availabilityRepository.deleteAll(availabilityRepository.findByProviderIdOrderByDayOfWeekAscStartTimeAsc(s.provider().getId())
                .stream().filter(a -> Objects.equals(staffId(a.getStaff()), staffId(staff))).toList());
        availabilityRepository.flush();
        List<Availability> saved = availabilityRepository.saveAll(windows.stream().map(w -> Availability.builder()
                .provider(s.provider()).staff(staff).dayOfWeek(w.dayOfWeek())
                .startTime(w.startTime()).endTime(w.endTime()).active(true).build()).toList());
        auditService.record("AVAILABILITY_REPLACED", staff == null ? "Provider" : "Staff",
                staff == null ? s.provider().getId() : staff.getId(), saved.size() + " windows");
        return saved.stream().map(mapper::availability).toList();
    }

    @Transactional
    public AvailabilityResponse update(Long id, AvailabilityRequest req) {
        Availability a = ownedAvailability(id);
        a.setDayOfWeek(req.dayOfWeek());
        a.setStartTime(req.startTime());
        a.setEndTime(req.endTime());
        if (req.active() != null) a.setActive(req.active());
        auditService.record("AVAILABILITY_UPDATED", "Availability", id, describe(a));
        return mapper.availability(a);
    }

    @Transactional
    public void delete(Long id) {
        Availability a = ownedAvailability(id);
        availabilityRepository.delete(a);
        auditService.record("AVAILABILITY_DELETED", "Availability", id, describe(a));
    }

    @Transactional
    public BlockedDateResponse block(BlockDateRequest req) {
        Scope s = scope(req.staffId());
        Staff staff = s.targetStaff();
        if (req.date().isBefore(LocalDate.now(s.provider().zone()))) {
            throw ApiException.badRequest("Cannot change a date in the past");
        }
        boolean available = Boolean.TRUE.equals(req.available());
        if (available && req.startTime() == null) {
            throw ApiException.badRequest("Custom working hours need a start and end time");
        }
        // one entry per provider/staff/date
        blockedDateRepository.findByProviderIdAndDate(s.provider().getId(), req.date()).stream()
                .filter(b -> Objects.equals(staffId(b.getStaff()), staffId(staff)))
                .forEach(blockedDateRepository::delete);
        blockedDateRepository.flush();
        BlockedDate b = blockedDateRepository.save(BlockedDate.builder()
                .provider(s.provider()).staff(staff).date(req.date())
                .startTime(req.startTime()).endTime(req.endTime())
                .available(available).reason(req.reason()).build());
        auditService.record(available ? "CUSTOM_HOURS_SET" : "DATE_BLOCKED", "BlockedDate", b.getId(),
                req.date() + (req.startTime() == null ? " (all day)" : " " + req.startTime() + "-" + req.endTime())
                        + (req.reason() == null ? "" : ": " + req.reason()));
        return mapper.blockedDate(b);
    }

    @Transactional
    public void unblock(Long id) {
        BlockedDate b = blockedDateRepository.findById(id).orElseThrow(() -> ApiException.notFound("Blocked date not found"));
        Scope s = scope(staffId(b.getStaff()));
        if (!b.getProvider().getId().equals(s.provider().getId())) {
            throw ApiException.notFound("Blocked date not found");
        }
        blockedDateRepository.delete(b);
        auditService.record("DATE_UNBLOCKED", "BlockedDate", id, b.getDate().toString());
    }

    // ------------------------------------------------------------------ access scope

    /** provider = whose calendar; targetStaff = staff row to edit (null = provider level); ownStaff = the STAFF caller. */
    private record Scope(Provider provider, Staff targetStaff, Staff ownStaff) {}

    private Scope scope(Long requestedStaffId) {
        Long uid = SecurityUtils.currentUserId();
        if (SecurityUtils.hasRole(UserRole.STAFF)) {
            Staff own = staffRepository.findByUserId(uid).filter(Staff::isActive)
                    .orElseThrow(() -> ApiException.forbidden("No active staff profile for this account"));
            if (requestedStaffId != null && !requestedStaffId.equals(own.getId())) {
                throw ApiException.forbidden("Staff can only manage their own hours");
            }
            return new Scope(own.getProvider(), own, own);
        }
        if (!SecurityUtils.hasRole(UserRole.PROVIDER)) {
            throw ApiException.forbidden("Only providers and staff manage availability");
        }
        Provider p = providerRepository.findByUserId(uid).orElseThrow(() -> ApiException.notFound("Provider profile not found"));
        Staff staff = requestedStaffId == null ? null : staffRepository.findByIdAndProviderId(requestedStaffId, p.getId())
                .orElseThrow(() -> ApiException.badRequest("Staff not found for this provider"));
        return new Scope(p, staff, null);
    }

    private Availability ownedAvailability(Long id) {
        Availability a = availabilityRepository.findById(id).orElseThrow(() -> ApiException.notFound("Availability not found"));
        Scope s = scope(staffId(a.getStaff()));
        if (!a.getProvider().getId().equals(s.provider().getId())) {
            throw ApiException.notFound("Availability not found");
        }
        return a;
    }

    private static Long staffId(Staff s) {
        return s == null ? null : s.getId();
    }

    private static String describe(Availability a) {
        return com.booking.util.BookingUtils.dayName(a.getDayOfWeek()) + " " + a.getStartTime() + "-" + a.getEndTime()
                + (a.getStaff() == null ? "" : " (staff #" + a.getStaff().getId() + ")");
    }
}
