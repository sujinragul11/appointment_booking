package com.booking.service;

import com.booking.booking.BookingPolicy;
import com.booking.booking.SlotEngine;
import com.booking.booking.SlotLockService;
import com.booking.dto.request.*;
import com.booking.dto.response.*;
import com.booking.entity.*;
import com.booking.enums.*;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.*;
import com.booking.security.SecurityUtils;
import com.booking.security.UserPrincipal;
import com.booking.util.BookingUtils;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Booking lifecycle (FR-21..32): hold -> book -> pay -> confirm -> complete / no-show,
 * plus cancel / reschedule with policy checks. All writes that consume capacity run under
 * a pessimistic lock on the provider row and are backed by a unique slot key (FR-22, NFR-7).
 */
@Service
@RequiredArgsConstructor
public class AppointmentService {

    private final AppointmentRepository appointmentRepository;
    private final ProviderRepository providerRepository;
    private final UserRepository userRepository;
    private final StaffRepository staffRepository;
    private final PaymentRepository paymentRepository;
    private final ReviewRepository reviewRepository;
    private final SlotEngine slotEngine;
    private final SlotLockService slotLockService;
    private final CouponService couponService;
    private final PaymentService paymentService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final ExportService exportService;
    private final DtoMapper mapper;
    private final Clock clock;

    @Value("${app.payments.checkout-ttl-minutes:10}")
    private int checkoutTtlMinutes;

    @Value("${app.video.base-url:https://meet.jit.si}")
    private String videoBaseUrl;

    @Value("${app.payments.demo-mode:false}")
    private boolean paymentsDemoMode;

    // ================================================================== slots & holds

    @Transactional(readOnly = true)
    public SlotsResponse slots(Long providerId, Long serviceId, Long staffId, LocalDate date) {
        Long viewer = SecurityUtils.current().map(UserPrincipal::getId).orElse(null);
        return slotEngine.slots(providerId, serviceId, staffId, date, viewer);
    }

    /** Locks a slot for 10 minutes while the customer completes checkout. */
    @Transactional
    public SlotHoldResponse hold(SlotHoldRequest req) {
        User customer = currentCustomer();
        providerRepository.lockById(req.providerId()).orElseThrow(() -> ApiException.notFound("Provider not found"));
        SlotEngine.Context ctx = slotEngine.resolve(req.providerId(), req.serviceId(), req.staffId());
        slotLockService.releaseForUser(customer.getId(), req.providerId());
        SlotEngine.Candidate c = slotEngine.find(ctx, req.date(), req.startTime(), null, customer.getId())
                .orElseThrow(() -> ApiException.conflict("This time is no longer available. Please pick another slot."));
        Long staffId = pickStaff(ctx, c);
        var hold = slotLockService.create(customer.getId(), req.providerId(), req.serviceId(), staffId, req.date(),
                req.startTime(), c.startAt(), c.busyUntil());
        return new SlotHoldResponse(hold.token(), req.date(), c.start(), c.end(), staffId, hold.expiresAt());
    }

    @Transactional
    public void releaseHold(String token) {
        slotLockService.find(token).filter(h -> h.userId().equals(SecurityUtils.currentUserId()))
                .ifPresent(h -> slotLockService.release(token));
    }

    // ================================================================== booking (FR-21..26)

    @Transactional
    public AppointmentResponse create(AppointmentRequest req) {
        User customer = currentCustomer();
        if (!customer.isVerified()) {
            throw ApiException.forbidden("Please verify your e-mail address before booking");
        }
        Provider provider = providerRepository.lockById(req.providerId())
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        SlotEngine.Context ctx = slotEngine.resolve(provider.getId(), req.serviceId(), req.staffId());
        DomainService svc = ctx.service();

        ServiceMode mode = resolveMode(svc, req.mode());
        if (req.paymentMethod() == PaymentMethod.PAY_AT_VENUE && mode == ServiceMode.ONLINE) {
            throw ApiException.badRequest("Online consultations must be paid online");
        }
        PaymentOption option = resolveOption(svc, req.paymentMethod(), req.paymentOption());

        String dateProblem = slotEngine.checkDate(ctx, req.date());
        if (dateProblem != null) {
            throw ApiException.badRequest(dateProblem);
        }
        SlotEngine.Candidate slot = slotEngine.find(ctx, req.date(), req.startTime(), null, customer.getId())
                .orElseThrow(() -> ApiException.conflict("Sorry, this slot was just taken. Please choose another time."));
        Long staffId = pickStaff(ctx, slot);
        if (req.holdToken() != null) {
            slotLockService.release(req.holdToken());
        }
        slotLockService.releaseForUser(customer.getId(), provider.getId());

        double amount = svc.getPrice();
        double discount = 0;
        String couponCode = null;
        if (req.couponCode() != null && !req.couponCode().isBlank()) {
            var r = couponService.redeem(req.couponCode(), amount, customer.getId());
            discount = r.discount();
            couponCode = r.code();
        }
        double finalAmount = BookingUtils.money(amount - discount);

        String ref;
        do {
            ref = BookingUtils.generateBookingRef(LocalDate.now(clock));
        } while (appointmentRepository.existsByBookingRef(ref));

        boolean free = finalAmount <= 0;
        boolean online = req.paymentMethod() == PaymentMethod.RAZORPAY && !free;
        AppointmentStatus status = (!online && provider.isAutoConfirm()) ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING;

        Appointment a = Appointment.builder()
                .bookingRef(ref)
                .customer(customer)
                .provider(provider)
                .service(svc)
                .staff(staffId == null ? null : staffRepository.getReferenceById(staffId))
                .date(req.date())
                .startTime(slot.start())
                .endTime(slot.end())
                .startAt(slot.startAt())
                .endAt(slot.endAt())
                .busyUntil(slot.busyUntil())
                .timezone(provider.getTimezone())
                .slotKey(SlotEngine.slotKey(provider.getId(), staffId, slot.startAt(), slot.nextSeat()))
                .status(status)
                .mode(mode)
                .notes(blankToNull(req.notes()))
                .amount(amount)
                .discount(discount)
                .finalAmount(finalAmount)
                .couponCode(couponCode)
                .paymentStatus(free ? PaymentStatus.SUCCESS : PaymentStatus.PENDING)
                .paymentDueAt(online ? clock.instant().plus(Duration.ofMinutes(checkoutTtlMinutes)) : null)
                .build();
        if (mode == ServiceMode.ONLINE) {
            a.setMeetingLink(videoBaseUrl.replaceAll("/+$", "") + "/BookEase-" + ref + "-" + BookingUtils.randomString(8));
        }
        a = appointmentRepository.saveAndFlush(a);

        double chargeNow = !online ? 0 : option == PaymentOption.DEPOSIT
                ? BookingUtils.money(finalAmount * svc.getDepositPercent() / 100.0) : finalAmount;
        paymentRepository.save(Payment.builder()
                .appointment(a)
                .amount(chargeNow)
                .balanceDue(BookingUtils.money(finalAmount - chargeNow))
                .method(free ? PaymentMethod.PAY_AT_VENUE : req.paymentMethod())
                .option(free ? PaymentOption.FULL : option)
                .status(free ? PaymentStatus.SUCCESS : PaymentStatus.PENDING)
                .paidAt(free ? LocalDateTime.now(clock) : null)
                .build());

        auditService.record("APPOINTMENT_BOOKED", "Appointment", a.getId(),
                ref + " " + svc.getName() + " " + a.getDate() + " " + a.getStartTime() + " " + provider.getTimezone());
        if (!online) {
            notificationService.bookingCreated(a);
        } else {
            notificationService.inApp(customer, "Complete your payment",
                    "Booking " + ref + " is reserved for " + checkoutTtlMinutes + " minutes. Complete the payment to confirm it.",
                    NotifType.PAYMENT, "/appointments/" + a.getId());
            notificationService.inApp(provider.getUser(), "New booking " + ref + " (awaiting payment)",
                    customer.getName() + " booked " + svc.getName() + " on " + NotificationService.when(a) + ".",
                    NotifType.BOOKING, "/dashboard/provider/appointments?ref=" + ref);
        }
        return toResponse(a);
    }

    // ================================================================== reads

    @Transactional(readOnly = true)
    public AppointmentResponse get(Long id) {
        return toResponse(viewable(id));
    }

    @Transactional(readOnly = true)
    public AppointmentResponse getByRef(String ref) {
        Appointment a = appointmentRepository.findAll((r, q, cb) -> cb.equal(r.get("bookingRef"), ref)).stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        return toResponse(viewable(a.getId()));
    }

    /** Customer dashboard (FR-27). scope = upcoming | past | cancelled | all. */
    @Transactional(readOnly = true)
    public List<AppointmentResponse> mine(String scope) {
        Instant now = clock.instant();
        return toResponses(appointmentRepository.findByCustomerIdOrderByDateDescStartTimeDesc(SecurityUtils.currentUserId())
                .stream().filter(a -> inScope(a, scope, now)).toList());
    }

    @Transactional(readOnly = true)
    public PageResponse<AppointmentResponse> forProvider(AppointmentStatus status, LocalDate from, LocalDate to,
                                                         String q, Long staffId, int page, int size) {
        Provider p = currentProvider();
        return search(p.getId(), staffId, status, from, to, q, null, page, size);
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> forProviderOnDate(LocalDate date) {
        return toResponses(appointmentRepository.findByProviderIdAndDateOrderByStartTimeAsc(currentProvider().getId(), date));
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> forStaff(String scope) {
        Staff staff = currentStaff();
        Instant now = clock.instant();
        return toResponses(appointmentRepository.findByStaffIdOrderByDateDescStartTimeDesc(staff.getId()).stream()
                .filter(a -> inScope(a, scope, now)).toList());
    }

    /** Admin: all appointments with filters (FR-45). */
    @Transactional(readOnly = true)
    public PageResponse<AppointmentResponse> adminSearch(Long providerId, AppointmentStatus status, LocalDate from,
                                                         LocalDate to, String q, Long customerId, int page, int size) {
        return search(providerId, null, status, from, to, q, customerId, page, size);
    }

    /** CSV / PDF export of appointments (FR-47); providerId null = whole platform (admin). */
    @Transactional(readOnly = true)
    public byte[] export(Long providerId, AppointmentStatus status, LocalDate from, LocalDate to, String q,
                         ExportService.Format format) {
        List<Appointment> rows = appointmentRepository.findAll(spec(providerId, null, status, from, to, q, null),
                Sort.by(Sort.Direction.DESC, "date", "startTime"));
        return exportService.appointments(rows, format);
    }

    @Transactional(readOnly = true)
    public byte[] exportForCurrentProvider(AppointmentStatus status, LocalDate from, LocalDate to, ExportService.Format format) {
        return export(currentProvider().getId(), status, from, to, null, format);
    }

    public record Invoice(String filename, byte[] pdf) {}

    @Transactional(readOnly = true)
    public Invoice invoice(Long id) {
        Appointment a = viewable(id);
        Payment p = paymentRepository.findByAppointmentId(a.getId()).orElseThrow(() -> ApiException.notFound("Payment not found"));
        return new Invoice("invoice-" + a.getBookingRef() + ".pdf", exportService.invoice(p));
    }

    private PageResponse<AppointmentResponse> search(Long providerId, Long staffId, AppointmentStatus status, LocalDate from,
                                                     LocalDate to, String q, Long customerId, int page, int size) {
        Page<Appointment> result = appointmentRepository.findAll(spec(providerId, staffId, status, from, to, q, customerId),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                        Sort.by(Sort.Direction.DESC, "date").and(Sort.by(Sort.Direction.DESC, "startTime"))));
        return PageResponse.of(result, toResponses(result.getContent()));
    }

    private Specification<Appointment> spec(Long providerId, Long staffId, AppointmentStatus status, LocalDate from,
                                            LocalDate to, String q, Long customerId) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (providerId != null) ps.add(cb.equal(root.get("provider").get("id"), providerId));
            if (staffId != null) ps.add(cb.equal(root.get("staff").get("id"), staffId));
            if (customerId != null) ps.add(cb.equal(root.get("customer").get("id"), customerId));
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("date"), from));
            if (to != null) ps.add(cb.lessThanOrEqualTo(root.get("date"), to));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                Join<Appointment, User> c = root.join("customer");
                Join<Appointment, DomainService> s = root.join("service");
                Join<Appointment, Provider> p = root.join("provider");
                ps.add(cb.or(cb.like(cb.lower(root.get("bookingRef")), like), cb.like(cb.lower(c.get("name")), like),
                        cb.like(cb.lower(c.get("email")), like), cb.like(cb.lower(s.get("name")), like),
                        cb.like(cb.lower(p.get("businessName")), like)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }

    // ================================================================== cancel (FR-29, FR-39)

    @Transactional(readOnly = true)
    public CancellationPreviewResponse cancellationPreview(Long id) {
        Appointment a = viewable(id);
        var d = BookingPolicy.cancellation(a, actorType(a), clock.instant());
        double paid = paymentRepository.findByAppointmentId(a.getId())
                .filter(p -> p.getMethod() == PaymentMethod.RAZORPAY
                        && (p.getStatus() == PaymentStatus.SUCCESS || p.getStatus() == PaymentStatus.PARTIALLY_REFUNDED))
                .map(p -> p.getAmount() - p.getRefundAmount()).orElse(0.0);
        double refund = BookingUtils.money(paid * d.refundPercent() / 100.0);
        return new CancellationPreviewResponse(d.allowed(), d.message(), BookingUtils.money(paid), d.refundPercent(), refund,
                a.getProvider().getCancellationCutoffHours(), d.cutoffAt());
    }

    @Transactional
    public AppointmentResponse cancel(Long id, CancelRequest req) {
        Appointment a = viewable(id);
        ActorType actor = actorType(a);
        String reason = req == null ? null : blankToNull(req.reason());
        if (actor == ActorType.CUSTOMER && reason == null) {
            throw ApiException.badRequest("Please tell us why you are cancelling");
        }
        var d = BookingPolicy.cancellation(a, actor, clock.instant());
        if (!d.allowed()) {
            throw ApiException.badRequest(d.message());
        }
        return toResponse(doCancel(a, actor, reason, d.refundPercent()));
    }

    Appointment doCancel(Appointment a, ActorType actor, String reason, int refundPercent) {
        boolean wasUnpaidOnline = a.getPaymentDueAt() != null && a.getPaymentStatus() == PaymentStatus.PENDING;
        a.setStatus(AppointmentStatus.CANCELLED);
        a.setCancelledBy(actor);
        a.setCancelledAt(clock.instant());
        a.setCancelReason(reason);
        a.setSlotKey(null);
        a.setPaymentDueAt(null);
        double refunded = paymentService.refund(a, refundPercent, reason);
        if (wasUnpaidOnline && a.getCouponCode() != null) {
            couponService.release(a.getCouponCode());
        }
        paymentRepository.findByAppointmentId(a.getId())
                .filter(p -> p.getStatus() == PaymentStatus.PENDING)
                .ifPresent(p -> { p.setStatus(PaymentStatus.FAILED); p.setBalanceDue(0); a.setPaymentStatus(PaymentStatus.FAILED); });
        if (actor == ActorType.SYSTEM) {
            auditService.record(null, null, "SYSTEM", "APPOINTMENT_CANCELLED", "Appointment", a.getId(), a.getBookingRef() + ": " + reason);
        } else {
            auditService.record("APPOINTMENT_CANCELLED", "Appointment", a.getId(),
                    a.getBookingRef() + " by " + actor + (reason == null ? "" : ": " + reason) + (refunded > 0 ? ", refund " + refunded : ""));
        }
        notificationService.bookingCancelled(a, refunded);
        return a;
    }

    /** Releases slots of online bookings whose payment window expired (scheduler). */
    @Transactional
    public int expireUnpaid() {
        List<Long> ids = appointmentRepository.findExpiredUnpaid(clock.instant());
        for (Long id : ids) {
            appointmentRepository.findById(id)
                    .filter(a -> a.getStatus() == AppointmentStatus.PENDING && a.getPaymentStatus() == PaymentStatus.PENDING)
                    .ifPresent(a -> doCancel(a, ActorType.SYSTEM, "Payment not completed in time", 0));
        }
        return ids.size();
    }

    // ================================================================== reschedule (FR-28)

    @Transactional
    public AppointmentResponse reschedule(Long id, RescheduleRequest req) {
        Appointment a = viewable(id);
        ActorType actor = actorType(a);
        if (actor == ActorType.ADMIN) {
            throw ApiException.forbidden("Admins cannot reschedule on behalf of users");
        }
        var d = BookingPolicy.reschedule(a, actor, clock.instant());
        if (!d.allowed()) {
            throw ApiException.badRequest(d.message());
        }
        providerRepository.lockById(a.getProvider().getId());
        Long currentStaff = a.getStaff() == null ? null : a.getStaff().getId();
        SlotEngine.Context ctx = slotEngine.resolve(a.getProvider().getId(), a.getService().getId(), currentStaff);
        String dateProblem = slotEngine.checkDate(ctx, req.date());
        if (dateProblem != null) {
            throw ApiException.badRequest(dateProblem);
        }
        if (req.date().equals(a.getDate()) && req.startTime().equals(a.getStartTime())) {
            throw ApiException.badRequest("Pick a different time");
        }
        SlotEngine.Candidate slot = slotEngine.find(ctx, req.date(), req.startTime(), a.getId(), a.getCustomer().getId())
                .orElseThrow(() -> ApiException.conflict("The requested time is not available"));
        String previous = NotificationService.when(a);
        // free the old key first so the unique constraint allows the new one
        a.setSlotKey(null);
        appointmentRepository.saveAndFlush(a);
        a.setDate(req.date());
        a.setStartTime(slot.start());
        a.setEndTime(slot.end());
        a.setStartAt(slot.startAt());
        a.setEndAt(slot.endAt());
        a.setBusyUntil(slot.busyUntil());
        a.setSlotKey(SlotEngine.slotKey(a.getProvider().getId(), currentStaff, slot.startAt(), slot.nextSeat()));
        a.setReminder24hSent(false);
        a.setReminder1hSent(false);
        if (actor == ActorType.CUSTOMER) {
            a.setRescheduleCount(a.getRescheduleCount() + 1);
        }
        if (a.getStatus() != AppointmentStatus.PENDING) {
            a.setStatus(AppointmentStatus.RESCHEDULED);
        }
        appointmentRepository.saveAndFlush(a);
        auditService.record("APPOINTMENT_RESCHEDULED", "Appointment", a.getId(),
                a.getBookingRef() + " " + previous + " -> " + NotificationService.when(a) + " by " + actor
                        + (req.reason() == null ? "" : ": " + req.reason()));
        notificationService.bookingRescheduled(a, previous);
        return toResponse(a);
    }

    // ================================================================== provider / staff actions (FR-30..32)

    @Transactional
    public AppointmentResponse updateStatus(Long id, StatusUpdateRequest req) {
        Appointment a = viewable(id);
        ActorType actor = actorType(a);
        if (actor != ActorType.PROVIDER && actor != ActorType.STAFF) {
            throw ApiException.forbidden("Only the provider or assigned staff can change the status");
        }
        Instant now = clock.instant();
        switch (req.status()) {
            case CONFIRMED -> {
                if (!BookingPolicy.canConfirm(a)) {
                    throw ApiException.badRequest(a.getStatus() != AppointmentStatus.PENDING
                            ? "Only pending bookings can be confirmed" : "Waiting for the customer's online payment");
                }
                a.setStatus(AppointmentStatus.CONFIRMED);
                notificationService.bookingConfirmed(a);
            }
            case CANCELLED -> {
                // reject (pending) or cancel (confirmed) by the business: full refund, customer notified
                if (!a.getStatus().isActive()) {
                    throw ApiException.badRequest("Only upcoming bookings can be rejected or cancelled");
                }
                if (blankToNull(req.reason()) == null) {
                    throw ApiException.badRequest("A reason is required when rejecting or cancelling");
                }
                doCancel(a, actor, req.reason(), 100);
                return toResponse(a);
            }
            case COMPLETED, NO_SHOW -> {
                if (a.getStatus() != AppointmentStatus.CONFIRMED && a.getStatus() != AppointmentStatus.RESCHEDULED) {
                    throw ApiException.badRequest("Only confirmed bookings can be completed or marked no-show");
                }
                if (!BookingPolicy.hasStarted(a, now)) {
                    throw ApiException.badRequest("This can be recorded once the appointment time has started");
                }
                a.setStatus(req.status());
                a.setSlotKey(null);
                if (req.status() == AppointmentStatus.COMPLETED) {
                    notificationService.statusChanged(a, "Thanks for visiting!",
                            "Your appointment " + a.getBookingRef() + " is complete. We'd love your review.");
                } else {
                    notificationService.statusChanged(a, "Missed appointment",
                            "You were marked as a no-show for booking " + a.getBookingRef() + ".");
                }
            }
            default -> throw ApiException.badRequest("Unsupported status change: " + req.status());
        }
        auditService.record("APPOINTMENT_" + req.status(), "Appointment", a.getId(), a.getBookingRef()
                + (req.reason() == null ? "" : ": " + req.reason()));
        return toResponse(a);
    }

    @Transactional
    public AppointmentResponse addProviderNotes(Long id, ProviderNotesRequest req) {
        Appointment a = viewable(id);
        ActorType actor = actorType(a);
        if (actor != ActorType.PROVIDER && actor != ActorType.STAFF) {
            throw ApiException.forbidden("Only the provider or assigned staff can add notes");
        }
        if (a.getStatus() != AppointmentStatus.COMPLETED) {
            throw ApiException.badRequest("Notes / prescriptions can be added after the appointment is completed");
        }
        a.setProviderNotes(req.providerNotes());
        auditService.record("APPOINTMENT_NOTES_UPDATED", "Appointment", a.getId(), a.getBookingRef());
        notificationService.statusChanged(a, "Notes from your appointment",
                a.getProvider().getBusinessName() + " added notes to booking " + a.getBookingRef() + ".");
        return toResponse(a);
    }

    @Transactional(readOnly = true)
    public String ics(Long id) {
        Appointment a = viewable(id);
        String location = a.getMode() == ServiceMode.ONLINE ? a.getMeetingLink()
                : Objects.toString(a.getProvider().getAddress(), "") + (a.getProvider().getCity() == null ? "" : ", " + a.getProvider().getCity());
        return BookingUtils.buildIcs(a.getBookingRef(), a.getService().getName() + " - " + a.getProvider().getBusinessName(),
                a.getStartAt(), a.getEndAt(), location, "Booking " + a.getBookingRef(), a.getMeetingLink());
    }

    // ================================================================== access control

    /** Loads an appointment the caller may see: its customer, the provider, the assigned staff or an admin. */
    public Appointment viewable(Long id) {
        Appointment a = appointmentRepository.findWithDetailsById(id)
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        actorType(a);
        return a;
    }

    ActorType actorType(Appointment a) {
        UserPrincipal u = SecurityUtils.currentUser();
        if (a.getCustomer().getId().equals(u.getId())) return ActorType.CUSTOMER;
        if (a.getProvider().getUser().getId().equals(u.getId())) return ActorType.PROVIDER;
        if (a.getStaff() != null && a.getStaff().getUser() != null && a.getStaff().getUser().getId().equals(u.getId())) {
            return ActorType.STAFF;
        }
        if (u.getRole() == UserRole.ADMIN) return ActorType.ADMIN;
        throw ApiException.notFound("Appointment not found");
    }

    // ================================================================== mapping

    private AppointmentResponse toResponse(Appointment a) {
        return toResponses(List.of(a)).get(0);
    }

    private List<AppointmentResponse> toResponses(List<Appointment> list) {
        if (list.isEmpty()) return List.of();
        List<Long> ids = list.stream().map(Appointment::getId).toList();
        Map<Long, Payment> payments = paymentRepository.findByAppointmentIdIn(ids).stream()
                .collect(Collectors.toMap(p -> p.getAppointment().getId(), Function.identity()));
        Set<Long> reviewed = new HashSet<>();
        for (Appointment a : list) {
            if (a.getStatus() == AppointmentStatus.COMPLETED && reviewRepository.findByAppointmentId(a.getId()).isPresent()) {
                reviewed.add(a.getId());
            }
        }
        Instant now = clock.instant();
        return list.stream().map(a -> {
            ActorType actor = actorType(a);
            boolean isReviewed = reviewed.contains(a.getId());
            return mapper.appointment(a, payments.get(a.getId()), isReviewed, actions(a, actor, now, isReviewed),
                    actor != ActorType.CUSTOMER);
        }).toList();
    }

    private AppointmentResponse.Actions actions(Appointment a, ActorType actor, Instant now, boolean reviewed) {
        boolean business = actor == ActorType.PROVIDER || actor == ActorType.STAFF;
        boolean customer = actor == ActorType.CUSTOMER;
        boolean started = BookingPolicy.hasStarted(a, now);
        boolean confirmedLike = a.getStatus() == AppointmentStatus.CONFIRMED || a.getStatus() == AppointmentStatus.RESCHEDULED;
        return new AppointmentResponse.Actions(
                (customer || business || actor == ActorType.ADMIN) && BookingPolicy.cancellation(a, actor, now).allowed(),
                (customer || business) && BookingPolicy.reschedule(a, actor, now).allowed(),
                customer && a.getStatus() == AppointmentStatus.PENDING && a.getPaymentStatus() == PaymentStatus.PENDING
                        && a.getPaymentDueAt() != null && a.getPaymentDueAt().isAfter(now),
                customer && a.getStatus() == AppointmentStatus.COMPLETED && !reviewed,
                business && BookingPolicy.canConfirm(a),
                business && a.getStatus() == AppointmentStatus.PENDING,
                business && confirmedLike && started,
                business && confirmedLike && started,
                business && a.getStatus() == AppointmentStatus.COMPLETED);
    }

    // ================================================================== helpers

    private static boolean inScope(Appointment a, String scope, Instant now) {
        if (scope == null || scope.isBlank() || "all".equalsIgnoreCase(scope)) return true;
        return switch (scope.toLowerCase()) {
            case "upcoming" -> a.getStatus().isActive() && a.getEndAt().isAfter(now);
            case "past" -> a.getStatus() != AppointmentStatus.CANCELLED && !(a.getStatus().isActive() && a.getEndAt().isAfter(now));
            case "cancelled" -> a.getStatus() == AppointmentStatus.CANCELLED;
            default -> true;
        };
    }

    private Long pickStaff(SlotEngine.Context ctx, SlotEngine.Candidate c) {
        if (ctx.service().getStaff().isEmpty()) return null;
        if (ctx.staff() != null) return ctx.staff().getId();
        return c.freeStaffIds().get(0);
    }

    private static ServiceMode resolveMode(DomainService svc, ServiceMode requested) {
        if (svc.getMode() == ServiceMode.BOTH) {
            return requested == null || requested == ServiceMode.BOTH ? ServiceMode.IN_PERSON : requested;
        }
        if (requested != null && requested != ServiceMode.BOTH && requested != svc.getMode()) {
            throw ApiException.badRequest("This service is only available " + (svc.getMode() == ServiceMode.ONLINE ? "online" : "in person"));
        }
        return svc.getMode();
    }

    private static PaymentOption resolveOption(DomainService svc, PaymentMethod method, PaymentOption requested) {
        if (method == PaymentMethod.PAY_AT_VENUE) return PaymentOption.PAY_AT_VENUE;
        if (requested == PaymentOption.DEPOSIT) {
            if (svc.getDepositPercent() <= 0 || svc.getDepositPercent() >= 100) {
                throw ApiException.badRequest("This service does not accept deposits");
            }
            return PaymentOption.DEPOSIT;
        }
        return PaymentOption.FULL;
    }

    private User currentCustomer() {
        if (!SecurityUtils.hasRole(UserRole.CUSTOMER)) {
            throw ApiException.forbidden("Only customer accounts can book appointments");
        }
        return userRepository.findById(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));
    }

    private Provider currentProvider() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    private Staff currentStaff() {
        return staffRepository.findByUserId(SecurityUtils.currentUserId()).filter(Staff::isActive)
                .orElseThrow(() -> ApiException.forbidden("No active staff profile for this account"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
