package com.booking.service;

import com.booking.dto.response.PageResponse;
import com.booking.dto.response.StatsResponse;
import com.booking.dto.response.UserResponse;
import com.booking.entity.User;
import com.booking.enums.*;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.*;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/** User management and platform statistics for admins (FR-44). */
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final ProviderRepository providerRepository;
    private final AppointmentRepository appointmentRepository;
    private final PaymentRepository paymentRepository;
    private final ReviewRepository reviewRepository;
<<<<<<< HEAD
    private final StaffRepository staffRepository;
    private final AuditService auditService;
    private final DtoMapper mapper;
=======
    private final SlotRepository slotRepository;
    private final CategoryRepository categoryRepository;
    private final DomainServiceRepository serviceRepository;
>>>>>>> a52368e (backendcommit)

    @Transactional(readOnly = true)
    public StatsResponse stats() {
        double revenue = paymentRepository.netCollected();
        return new StatsResponse(
                userRepository.countByDeletedFalse(),
                userRepository.countByRoleAndDeletedFalse(UserRole.CUSTOMER),
                userRepository.countByRoleAndDeletedFalse(UserRole.PROVIDER),
                providerRepository.countByStatus(ProviderStatus.PENDING),
                appointmentRepository.count(),
                appointmentRepository.countByStatus(AppointmentStatus.PENDING),
                appointmentRepository.countByStatus(AppointmentStatus.CONFIRMED) + appointmentRepository.countByStatus(AppointmentStatus.RESCHEDULED),
                appointmentRepository.countByStatus(AppointmentStatus.COMPLETED),
                appointmentRepository.countByStatus(AppointmentStatus.CANCELLED),
                BookingUtils.money(revenue),
                reviewRepository.count(),
                reviewRepository.countByStatus(ReviewStatus.PENDING));
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> users(String q, UserRole role, Boolean active, int page, int size) {
        Specification<User> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.isFalse(root.get("deleted")));
            if (role != null) ps.add(cb.equal(root.get("role"), role));
            if (active != null) ps.add(cb.equal(root.get("active"), active));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(cb.lower(root.get("email")), like),
                        cb.like(cb.coalesce(root.get("phone"), ""), like)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Page<User> result = userRepository.findAll(spec, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id"))));
        return PageResponse.of(result, result.getContent().stream().map(mapper::user).toList());
    }

    public List<User> exportUsers() {
        return userRepository.findAll(Sort.by("id")).stream().filter(u -> !u.isDeleted()).toList();
    }

    /** Activate / deactivate: deactivation revokes all sessions immediately. */
    @Transactional
    public UserResponse setActive(Long id, boolean active) {
        User u = manageable(id);
        u.setActive(active);
        if (!active) {
            u.setTokenVersion(u.getTokenVersion() + 1);
        }
        staffRepository.findByUserId(id).ifPresent(s -> s.setActive(active));
        auditService.record(active ? "USER_ACTIVATED" : "USER_DEACTIVATED", "User", id, u.getEmail());
        return mapper.user(u);
    }

    /**
     * Deletes an account. Booking and payment history must be kept for accounting, so the
     * user is anonymised and disabled rather than physically removed.
     */
    @Transactional
    public void delete(Long id) {
        User u = manageable(id);
        String original = u.getEmail();
        u.setDeleted(true);
        u.setActive(false);
        u.setTokenVersion(u.getTokenVersion() + 1);
        u.setName("Deleted user");
        u.setEmail("deleted-" + u.getId() + "-" + BookingUtils.randomString(6).toLowerCase() + "@deleted.invalid");
        u.setPhone(null);
        u.setPhotoUrl(null);
        u.setGoogleId(null);
        u.getAddresses().clear();
        providerRepository.findByUserId(id).ifPresent(p -> p.setStatus(ProviderStatus.SUSPENDED));
        staffRepository.findByUserId(id).ifPresent(s -> { s.setActive(false); s.setUser(null); });
        auditService.record("USER_DELETED", "User", id, BookingUtils.maskEmail(original));
    }

    private User manageable(Long id) {
        User u = userRepository.findById(id).filter(x -> !x.isDeleted())
                .orElseThrow(() -> ApiException.notFound("User not found"));
        if (u.getId().equals(SecurityUtils.currentUserId())) {
            throw ApiException.badRequest("You cannot change your own account here");
        }
        return u;
    }
<<<<<<< HEAD
}
=======

    @Transactional
    public void deleteCategory(Long id) {
        if (providerRepository.existsByCategoryId(id) || serviceRepository.existsByCategoryId(id)) {
            throw ApiException.conflict("Category is in use by providers or services");
        }
        categoryRepository.deleteById(id);
    }

    private ProviderResponse toResponseLite(Provider p) {
        CategoryResponse cat = p.getCategory() != null
                ? new CategoryResponse(p.getCategory().getId(), p.getCategory().getName(),
                        p.getCategory().getIcon(), p.getCategory().getSlug())
                : null;
        return new ProviderResponse(
                p.getId(), p.getBusinessName(), p.getDescription(), p.getLogoUrl(), p.getCoverUrl(),
                cat, p.getCity(), p.getState(), p.getCountry(), p.getAddress(),
                p.getLatitude(), p.getLongitude(), p.getPhone(), p.getWebsite(), p.getStatus(),
                p.getRating(), p.getReviewCount(), p.getMaxAdvanceBookingDays(), p.getCancellationPolicy(),
                p.getCreatedAt(), null, null, null);
    }
}
>>>>>>> a52368e (backendcommit)
