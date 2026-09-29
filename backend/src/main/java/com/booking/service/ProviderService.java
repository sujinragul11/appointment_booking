package com.booking.service;

import com.booking.dto.request.AdminProviderDecision;
import com.booking.dto.request.BranchRequest;
import com.booking.dto.request.ProviderRequest;
import com.booking.dto.response.*;
import com.booking.entity.*;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.NotifType;
import com.booking.enums.PaymentStatus;
import com.booking.enums.ProviderStatus;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.*;
import com.booking.security.SecurityUtils;
import jakarta.persistence.criteria.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

/** Provider directory, search (FR-19, FR-49, FR-50), own profile (FR-13) and approval. */
@Service
@RequiredArgsConstructor
public class ProviderService {

    private final ProviderRepository providerRepository;
    private final CategoryRepository categoryRepository;
    private final BranchRepository branchRepository;
    private final AppointmentRepository appointmentRepository;
    private final PaymentRepository paymentRepository;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final DtoMapper mapper;

    public record SearchCriteria(String q, Long categoryId, String city, Double minRating, Double minPrice,
                                 Double maxPrice, Long serviceId, LocalDate date, String mode, String sort) {}

    @Transactional(readOnly = true)
    public PageResponse<ProviderResponse> search(SearchCriteria c, int page, int size) {
        Specification<Provider> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.equal(root.get("status"), ProviderStatus.VERIFIED));
            if (notBlank(c.city())) {
                ps.add(cb.equal(cb.lower(root.get("city")), c.city().trim().toLowerCase()));
            }
            if (c.categoryId() != null) {
                // provider category, or offers a service in the category
                Subquery<Long> sq = query.subquery(Long.class);
                Root<DomainService> s = sq.from(DomainService.class);
                sq.select(s.get("id")).where(cb.equal(s.get("provider"), root), cb.isTrue(s.get("active")),
                        cb.equal(s.get("category").get("id"), c.categoryId()));
                ps.add(cb.or(cb.equal(root.get("category").get("id"), c.categoryId()), cb.exists(sq)));
            }
            if (c.minRating() != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("rating"), c.minRating()));
            }
            if (c.serviceId() != null) {
                Subquery<Long> sq = query.subquery(Long.class);
                Root<DomainService> s = sq.from(DomainService.class);
                sq.select(s.get("id")).where(cb.equal(s.get("provider"), root), cb.equal(s.get("id"), c.serviceId()),
                        cb.isTrue(s.get("active")));
                ps.add(cb.exists(sq));
            }
            if (c.minPrice() != null || c.maxPrice() != null || notBlank(c.mode())) {
                Subquery<Long> sq = query.subquery(Long.class);
                Root<DomainService> s = sq.from(DomainService.class);
                List<Predicate> sp = new ArrayList<>(List.of(cb.equal(s.get("provider"), root), cb.isTrue(s.get("active"))));
                if (c.minPrice() != null) sp.add(cb.greaterThanOrEqualTo(s.get("price"), c.minPrice()));
                if (c.maxPrice() != null) sp.add(cb.lessThanOrEqualTo(s.get("price"), c.maxPrice()));
                if (notBlank(c.mode())) {
                    var mode = com.booking.enums.ServiceMode.valueOf(c.mode().trim().toUpperCase());
                    sp.add(cb.or(cb.equal(s.get("mode"), mode), cb.equal(s.get("mode"), com.booking.enums.ServiceMode.BOTH)));
                }
                sq.select(s.get("id")).where(sp.toArray(Predicate[]::new));
                ps.add(cb.exists(sq));
            }
            if (c.date() != null) {
                // Works on that weekday and is not closed for the whole day
                Subquery<Long> av = query.subquery(Long.class);
                Root<Availability> a = av.from(Availability.class);
                av.select(a.get("id")).where(cb.equal(a.get("provider"), root), cb.isTrue(a.get("active")),
                        cb.equal(a.get("dayOfWeek"), c.date().getDayOfWeek().getValue()));
                Subquery<Long> custom = query.subquery(Long.class);
                Root<BlockedDate> ch = custom.from(BlockedDate.class);
                custom.select(ch.get("id")).where(cb.equal(ch.get("provider"), root), cb.equal(ch.get("date"), c.date()),
                        cb.isTrue(ch.get("available")), cb.isNull(ch.get("staff")));
                Subquery<Long> closed = query.subquery(Long.class);
                Root<BlockedDate> b = closed.from(BlockedDate.class);
                closed.select(b.get("id")).where(cb.equal(b.get("provider"), root), cb.equal(b.get("date"), c.date()),
                        cb.isFalse(b.get("available")), cb.isNull(b.get("startTime")), cb.isNull(b.get("staff")));
                ps.add(cb.or(cb.exists(av), cb.exists(custom)));
                ps.add(cb.not(cb.exists(closed)));
            }
            if (notBlank(c.q())) {
                String like = "%" + c.q().trim().toLowerCase() + "%";
                Subquery<Long> sq = query.subquery(Long.class);
                Root<DomainService> s = sq.from(DomainService.class);
                sq.select(s.get("id")).where(cb.equal(s.get("provider"), root), cb.isTrue(s.get("active")),
                        cb.like(cb.lower(s.get("name")), like));
                Join<Provider, Category> cat = root.join("category", JoinType.LEFT);
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("businessName")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("specialty"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("city"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("address"), "")), like),
                        cb.like(cb.lower(cb.coalesce(cat.get("name"), "")), like),
                        cb.exists(sq)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Sort sort = switch (c.sort() == null ? "rating" : c.sort()) {
            case "reviews", "reviewCount" -> Sort.by(Sort.Direction.DESC, "reviewCount").and(Sort.by("id"));
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("id"));
            case "name" -> Sort.by(Sort.Direction.ASC, "businessName").and(Sort.by("id"));
            default -> Sort.by(Sort.Direction.DESC, "rating").and(Sort.by(Sort.Direction.DESC, "reviewCount")).and(Sort.by("id"));
        };
        Page<Provider> result = providerRepository.findAll(spec, PageRequest.of(Math.max(page, 0), clamp(size), sort));
        return PageResponse.of(result, result.getContent().stream().map(p -> mapper.provider(p, false, false, false)).toList());
    }

    @Transactional(readOnly = true)
    public List<ProviderResponse> nearby(double lat, double lng, double radiusKm) {
        double r = Math.min(Math.max(radiusKm, 1), 200);
        return providerRepository.findByStatus(ProviderStatus.VERIFIED).stream()
                .filter(p -> p.getLatitude() != null && p.getLongitude() != null)
                .filter(p -> haversine(lat, lng, p.getLatitude(), p.getLongitude()) <= r)
                .map(p -> mapper.provider(p, false, false, false))
                .toList();
    }

    /** Public profile: only verified providers are visible, except to their owner and admins. */
    @Transactional(readOnly = true)
    public ProviderResponse getPublic(Long id) {
        Provider p = providerRepository.findById(id).orElseThrow(() -> ApiException.notFound("Provider not found"));
        boolean owner = SecurityUtils.current().map(u -> u.getId().equals(p.getUser().getId())).orElse(false);
        boolean admin = SecurityUtils.hasRole(com.booking.enums.UserRole.ADMIN);
        if (p.getStatus() != ProviderStatus.VERIFIED && !owner && !admin) {
            throw ApiException.notFound("Provider not found");
        }
        return mapper.provider(p, true, owner || admin, admin);
    }

    @Transactional(readOnly = true)
    public ProviderResponse getMine() {
        return mapper.provider(current(), true, true, true);
    }

    @Transactional
    public ProviderResponse updateMine(ProviderRequest req) {
        Provider p = current();
        p.setBusinessName(req.businessName().trim());
        if (req.description() != null) p.setDescription(req.description());
        if (req.specialty() != null) p.setSpecialty(req.specialty());
        if (req.categoryId() != null) {
            p.setCategory(categoryRepository.findById(req.categoryId()).orElseThrow(() -> ApiException.badRequest("Unknown category")));
        }
        if (req.city() != null) p.setCity(req.city());
        if (req.state() != null) p.setState(req.state());
        if (req.country() != null) p.setCountry(req.country());
        if (req.address() != null) p.setAddress(req.address());
        if (req.latitude() != null) p.setLatitude(req.latitude());
        if (req.longitude() != null) p.setLongitude(req.longitude());
        if (req.phone() != null) p.setPhone(req.phone());
        if (req.website() != null) p.setWebsite(req.website());
        if (req.logoUrl() != null) p.setLogoUrl(req.logoUrl());
        if (req.coverUrl() != null) p.setCoverUrl(req.coverUrl());
        if (req.timezone() != null) {
            try {
                ZoneId.of(req.timezone());
            } catch (Exception e) {
                throw ApiException.badRequest("Unknown timezone: " + req.timezone());
            }
            p.setTimezone(req.timezone());
        }
        if (req.slotIntervalMin() != null) p.setSlotIntervalMin(req.slotIntervalMin());
        if (req.maxBookingsPerDay() != null) p.setMaxBookingsPerDay(req.maxBookingsPerDay());
        if (req.maxBookingsPerSlot() != null) p.setMaxBookingsPerSlot(req.maxBookingsPerSlot());
        if (req.minNoticeMin() != null) p.setMinNoticeMin(req.minNoticeMin());
        if (req.maxAdvanceBookingDays() != null) p.setMaxAdvanceBookingDays(req.maxAdvanceBookingDays());
        if (req.autoConfirm() != null) p.setAutoConfirm(req.autoConfirm());
        if (req.cancellationCutoffHours() != null) p.setCancellationCutoffHours(req.cancellationCutoffHours());
        if (req.lateCancelRefundPercent() != null) p.setLateCancelRefundPercent(req.lateCancelRefundPercent());
        if (req.rescheduleCutoffHours() != null) p.setRescheduleCutoffHours(req.rescheduleCutoffHours());
        if (req.maxReschedules() != null) p.setMaxReschedules(req.maxReschedules());
        if (req.cancellationPolicy() != null) p.setCancellationPolicy(req.cancellationPolicy().isBlank() ? null : req.cancellationPolicy());
        auditService.record("PROVIDER_PROFILE_UPDATED", "Provider", p.getId(), null);
        return mapper.provider(p, true, true, true);
    }

    // ------------------------------------------------------------------ branches (multi-location)

    @Transactional
    public BranchResponse addBranch(BranchRequest req) {
        Provider p = current();
        if (Boolean.TRUE.equals(req.main())) {
            p.getBranches().forEach(b -> b.setMain(false));
        }
        Branch b = branchRepository.save(Branch.builder().provider(p).name(req.name()).address(req.address())
                .city(req.city()).state(req.state()).country(req.country()).latitude(req.latitude())
                .longitude(req.longitude()).phone(req.phone()).main(Boolean.TRUE.equals(req.main())).build());
        return mapper.branch(b);
    }

    @Transactional(readOnly = true)
    public List<BranchResponse> branches() {
        return branchRepository.findByProviderId(current().getId()).stream().map(mapper::branch).toList();
    }

    @Transactional
    public void deleteBranch(Long id) {
        Branch b = branchRepository.findById(id)
                .filter(x -> x.getProvider().getId().equals(current().getId()))
                .orElseThrow(() -> ApiException.notFound("Branch not found"));
        branchRepository.delete(b);
    }

    // ------------------------------------------------------------------ dashboard stats

    @Transactional(readOnly = true)
    public ProviderStatsResponse stats() {
        Provider p = current();
        LocalDate today = LocalDate.now(p.zone());
        List<Appointment> all = appointmentRepository.findByProviderIdOrderByDateDescStartTimeDesc(p.getId());
        var active = EnumSet.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED);
        long todayCount = all.stream().filter(a -> a.getDate().equals(today) && a.getStatus() != AppointmentStatus.CANCELLED).count();
        long upcoming = all.stream().filter(a -> active.contains(a.getStatus()) && !a.getDate().isBefore(today)).count();
        long completed = all.stream().filter(a -> a.getStatus() == AppointmentStatus.COMPLETED).count();
        long cancelled = all.stream().filter(a -> a.getStatus() == AppointmentStatus.CANCELLED).count();
        long noShow = all.stream().filter(a -> a.getStatus() == AppointmentStatus.NO_SHOW).count();
        long pending = all.stream().filter(a -> a.getStatus() == AppointmentStatus.PENDING).count();
        List<Payment> payments = paymentRepository.findHistoryForProvider(p.getId());
        double total = payments.stream().mapToDouble(this::netCollected).sum();
        double month = payments.stream()
                .filter(pay -> pay.getPaidAt() != null && pay.getPaidAt().toLocalDate().withDayOfMonth(1).equals(today.withDayOfMonth(1)))
                .mapToDouble(this::netCollected).sum();
        return new ProviderStatsResponse(todayCount, upcoming, completed, cancelled, noShow, pending,
                round(month), round(total), p.getRating(), p.getReviewCount());
    }

    private double netCollected(Payment pay) {
        if (pay.getStatus() == PaymentStatus.SUCCESS || pay.getStatus() == PaymentStatus.PARTIALLY_REFUNDED
                || pay.getStatus() == PaymentStatus.REFUNDED) {
            return pay.getAmount() - pay.getRefundAmount();
        }
        return 0;
    }

    // ------------------------------------------------------------------ admin

    @Transactional(readOnly = true)
    public PageResponse<ProviderResponse> adminList(ProviderStatus status, String q, int page, int size) {
        Specification<Provider> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (notBlank(q)) {
                String like = "%" + q.trim().toLowerCase() + "%";
                Join<Provider, User> u = root.join("user");
                ps.add(cb.or(cb.like(cb.lower(root.get("businessName")), like), cb.like(cb.lower(u.get("email")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("city"), "")), like)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Page<Provider> result = providerRepository.findAll(spec,
                PageRequest.of(Math.max(page, 0), clamp(size), Sort.by(Sort.Direction.DESC, "createdAt")));
        return PageResponse.of(result, result.getContent().stream().map(p -> mapper.provider(p, true, true, true)).toList());
    }

    @Transactional
    public ProviderResponse decide(Long id, AdminProviderDecision d) {
        Provider p = providerRepository.findById(id).orElseThrow(() -> ApiException.notFound("Provider not found"));
        ProviderStatus old = p.getStatus();
        p.setStatus(d.status());
        p.setAdminNote(d.note());
        auditService.record("PROVIDER_" + d.status(), "Provider", id, old + " -> " + d.status()
                + (d.note() == null ? "" : ": " + d.note()));
        String msg = switch (d.status()) {
            case VERIFIED -> "Your business is approved and now visible to customers.";
            case REJECTED -> "Your provider application was rejected." + (d.note() == null ? "" : " Note: " + d.note());
            case SUSPENDED -> "Your provider account was suspended." + (d.note() == null ? "" : " Note: " + d.note());
            default -> "Your provider status changed to " + d.status() + ".";
        };
        notificationService.notify(p.getUser(), "Provider status: " + d.status(), msg, NotifType.ADMIN,
                "/dashboard/provider", NotificationService.Channel.IN_APP, NotificationService.Channel.EMAIL);
        return mapper.provider(p, true, true, true);
    }

    // ------------------------------------------------------------------ helpers

    public Provider current() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    static int clamp(int size) {
        return Math.min(Math.max(size, 1), 100);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
