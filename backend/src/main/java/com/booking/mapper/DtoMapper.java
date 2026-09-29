package com.booking.mapper;

import com.booking.dto.response.*;
import com.booking.entity.*;
import com.booking.repository.ProviderRepository;
import com.booking.repository.StaffRepository;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

/** Central entity -> DTO conversion so every endpoint exposes the same shapes. */
@Component
@RequiredArgsConstructor
public class DtoMapper {

    private final ProviderRepository providerRepository;
    private final StaffRepository staffRepository;

    public UserResponse user(User u) {
        Long providerId = providerRepository.findByUserId(u.getId()).map(Provider::getId).orElse(null);
        Long staffId = staffRepository.findByUserId(u.getId()).map(Staff::getId).orElse(null);
        return new UserResponse(u.getId(), u.getName(), u.getEmail(), u.getPhone(), u.getRole(), u.getPhotoUrl(),
                u.isVerified(), u.isVerified(), u.isPhoneVerified(), providerId, staffId, u.getLanguage(),
                u.getTimezone(), u.isNotifEmail(), u.isNotifSms(), u.isNotifPush(), u.isActive(),
                u.getCreatedAt(), u.getLastLoginAt());
    }

    public CategoryResponse category(Category c) {
        return c == null ? null : new CategoryResponse(c.getId(), c.getName(), c.getIcon(), c.getSlug(), c.getDescription());
    }

    public BranchResponse branch(Branch b) {
        return new BranchResponse(b.getId(), b.getName(), b.getAddress(), b.getCity(), b.getState(), b.getCountry(),
                b.getLatitude(), b.getLongitude(), b.getPhone(), b.isMain());
    }

    public ServiceResponse service(DomainService s) {
        Provider p = s.getProvider();
        List<Staff> staff = s.getStaff().stream().filter(Staff::isActive)
                .sorted(Comparator.comparing(Staff::getName)).toList();
        int maxDays = s.getMaxAdvanceBookingDays() > 0 ? s.getMaxAdvanceBookingDays() : p.getMaxAdvanceBookingDays();
        return new ServiceResponse(s.getId(), p.getId(), p.getBusinessName(), p.getCity(), p.getRating(),
                s.getName(), s.getDescription(), s.getDurationMin(), s.getBufferMin(), s.getPrice(),
                s.getDepositPercent(), s.getMode(),
                s.getCategory() != null ? s.getCategory().getId() : null,
                s.getCategory() != null ? s.getCategory().getName() : null,
                s.getImageUrl(), maxDays, s.isActive(),
                staff.stream().map(Staff::getId).toList(),
                staff.stream().map(Staff::getName).toList());
    }

    public StaffResponse staff(Staff s) {
        return new StaffResponse(s.getId(), s.getProvider().getId(), s.getName(), s.getDesignation(), s.getPhotoUrl(),
                s.getBio(), s.isActive(), s.getServices().stream().map(DomainService::getId).sorted().toList(),
                s.getUser() != null ? s.getUser().getEmail() : null);
    }

    public ProviderResponse.Policy policy(Provider p) {
        return new ProviderResponse.Policy(p.getSlotIntervalMin(), p.getMaxBookingsPerDay(), p.getMaxBookingsPerSlot(),
                p.getMinNoticeMin(), p.getMaxAdvanceBookingDays(), p.isAutoConfirm(), p.getCancellationCutoffHours(),
                p.getLateCancelRefundPercent(), p.getRescheduleCutoffHours(), p.getMaxReschedules(),
                p.getCancellationPolicy() != null && !p.getCancellationPolicy().isBlank()
                        ? p.getCancellationPolicy() : describePolicy(p));
    }

    public static String describePolicy(Provider p) {
        String s = "Free cancellation up to " + p.getCancellationCutoffHours() + " hours before the appointment";
        s += p.getLateCancelRefundPercent() > 0
                ? "; later cancellations are refunded " + p.getLateCancelRefundPercent() + "%."
                : "; later cancellations are not refunded.";
        if (p.getMaxReschedules() > 0) {
            s += " Reschedule up to " + p.getMaxReschedules() + " time(s), at least " + p.getRescheduleCutoffHours()
                    + " hours before the start.";
        }
        return s;
    }

    /**
     * @param full include services, staff and branches (profile page); otherwise a card-sized summary.
     * @param includeInactive include disabled services/staff (owner and admin views only).
     */
    public ProviderResponse provider(Provider p, boolean full, boolean includeInactive, boolean includePrivate) {
        List<DomainService> activeServices = p.getServices().stream().filter(DomainService::isActive).toList();
        Double minPrice = activeServices.stream().map(DomainService::getPrice).min(Double::compare).orElse(null);
        Double maxPrice = activeServices.stream().map(DomainService::getPrice).max(Double::compare).orElse(null);
        List<ServiceResponse> services = null;
        List<StaffResponse> staff = null;
        List<BranchResponse> branches = null;
        if (full) {
            services = p.getServices().stream().filter(s -> includeInactive || s.isActive())
                    .sorted(Comparator.comparing(DomainService::getName)).map(this::service).toList();
            staff = p.getStaff().stream().filter(s -> includeInactive || s.isActive())
                    .sorted(Comparator.comparing(Staff::getName)).map(this::staff).toList();
            branches = p.getBranches().stream().sorted(Comparator.comparing(Branch::getName)).map(this::branch).toList();
        }
        return new ProviderResponse(p.getId(), p.getBusinessName(), p.getDescription(), p.getSpecialty(),
                p.getLogoUrl(), p.getCoverUrl(), category(p.getCategory()), p.getCity(), p.getState(), p.getCountry(),
                p.getAddress(), p.getLatitude(), p.getLongitude(), p.getPhone(), p.getWebsite(), p.getTimezone(),
                p.getStatus(), p.getRating(), p.getReviewCount(), minPrice, maxPrice, policy(p),
                includePrivate ? p.getUser().getName() : null,
                includePrivate ? p.getUser().getEmail() : null,
                includePrivate ? p.getAdminNote() : null,
                p.getCreatedAt(), services, staff, branches);
    }

    public PaymentResponse payment(Payment p) {
        Appointment a = p.getAppointment();
        return new PaymentResponse(p.getId(), a.getId(), a.getBookingRef(), a.getService().getName(),
                a.getProvider().getBusinessName(), a.getCustomer().getName(), p.getAmount(), p.getBalanceDue(),
                p.getCurrency(), p.getMethod(), p.getOption(), p.getStatus(), p.getOrderId(), p.getTransactionId(),
                p.getRefundId(), p.getRefundAmount(), p.getInvoiceNumber(), p.getPaidAt(), p.getRefundedAt(),
                p.getCreatedAt());
    }

    public AppointmentResponse appointment(Appointment a, Payment payment, boolean reviewed,
                                           AppointmentResponse.Actions actions, boolean showContact) {
        Provider p = a.getProvider();
        User c = a.getCustomer();
        return new AppointmentResponse(a.getId(), a.getBookingRef(), c.getId(), c.getName(),
                showContact ? c.getEmail() : null, showContact ? c.getPhone() : null, c.getPhotoUrl(),
                p.getId(), p.getBusinessName(), p.getAddress() == null ? p.getCity() : p.getAddress() + (p.getCity() == null ? "" : ", " + p.getCity()),
                p.getPhone(), a.getService().getId(), a.getService().getName(), a.getService().getDurationMin(),
                a.getStaff() == null ? null : a.getStaff().getId(), a.getStaff() == null ? null : a.getStaff().getName(),
                a.getDate(), a.getStartTime(), a.getEndTime(), a.getStartAt(), a.getEndAt(), a.getTimezone(),
                a.getStatus(), a.getMode(), a.getMeetingLink(), a.getNotes(), a.getProviderNotes(),
                a.getAmount(), a.getDiscount(), a.getFinalAmount(), a.getCouponCode(), a.getPaymentStatus(),
                a.getCancelReason(), a.getCancelledBy(), a.getCancelledAt(), a.getRescheduleCount(), a.getPaymentDueAt(),
                payment == null ? null : payment(payment), reviewed, actions, a.getCreatedAt());
    }

    public ReviewResponse review(Review r) {
        return new ReviewResponse(r.getId(), r.getAppointment().getId(), r.getProvider().getId(),
                r.getProvider().getBusinessName(), r.getCustomer().getId(), r.getCustomer().getName(),
                r.getCustomer().getPhotoUrl(), r.getRating(), r.getComment(), r.getStatus(), r.getModerationNote(),
                r.isFlagged(), r.getFlagReason(), r.getReply(), r.getReplyAt(), r.getCreatedAt());
    }

    public NotificationResponse notification(Notification n) {
        return new NotificationResponse(n.getId(), n.getTitle(), n.getMessage(), n.getType(), n.getLink(), n.isRead(),
                n.getCreatedAt());
    }

    public AvailabilityResponse availability(Availability a) {
        return new AvailabilityResponse(a.getId(), a.getProvider().getId(),
                a.getStaff() == null ? null : a.getStaff().getId(), a.getDayOfWeek(),
                BookingUtils.dayName(a.getDayOfWeek()), a.getStartTime(), a.getEndTime(), a.isActive());
    }

    public BlockedDateResponse blockedDate(BlockedDate b) {
        return new BlockedDateResponse(b.getId(), b.getProvider().getId(),
                b.getStaff() == null ? null : b.getStaff().getId(), b.getDate(), b.getStartTime(), b.getEndTime(),
                b.isAvailable(), b.getReason());
    }

    public AddressResponse address(Address a) {
        return new AddressResponse(a.getId(), a.getLabel(), a.getAddressLine(), a.getCity(), a.getState(),
                a.getCountry(), a.getZip(), a.getLatitude(), a.getLongitude(), a.isDefaultAddress());
    }

    public CouponResponse coupon(Coupon c) {
        return new CouponResponse(c.getId(), c.getCode(), c.getDiscountType(), c.getValue(), c.getMinOrder(),
                c.getMaxDiscount(), c.getValidFrom(), c.getValidTo(), c.getUsageLimit(), c.getUsedCount(),
                c.getPerUserLimit(), c.isActive(), c.getCreatedAt());
    }

    public AuditLogResponse audit(AuditLog l) {
        return new AuditLogResponse(l.getId(), l.getActorId(), l.getActorEmail(), l.getActorRole(), l.getAction(),
                l.getEntityType(), l.getEntityId(), l.getDetails(), l.getIpAddress(), l.getCreatedAt());
    }
}
