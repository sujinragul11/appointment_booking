package com.booking.service;

import com.booking.dto.request.AppointmentRequest;
import com.booking.dto.request.CancelRequest;
import com.booking.dto.request.RescheduleRequest;
import com.booking.dto.request.StatusUpdateRequest;
import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.PaymentResponse;
import com.booking.dto.response.SlotResponse;
import com.booking.entity.*;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.PaymentMethod;
import com.booking.enums.PaymentStatus;
import com.booking.enums.SlotStatus;
import com.booking.exception.ApiException;
import com.booking.repository.*;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AppointmentService {

    private final AppointmentRepository appointmentRepository;
    private final ProviderRepository providerRepository;
    private final DomainServiceRepository serviceRepository;
    private final StaffRepository staffRepository;
    private final SlotRepository slotRepository;
    private final UserRepository userRepository;
    private final PaymentRepository paymentRepository;
    private final ReviewRepository reviewRepository;
    private final CouponService couponService;
    private final AvailabilityService availabilityService;
    private final NotificationService notificationService;

    @Transactional
    public AppointmentResponse create(AppointmentRequest req) {
        User customer = userRepository.findById(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
        Provider provider = providerRepository.findById(req.providerId())
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        DomainService svc = serviceRepository.findById(req.serviceId())
                .filter(s -> s.getProvider().getId().equals(provider.getId()) && s.isActive())
                .orElseThrow(() -> ApiException.badRequest("Service is not active for this provider"));
        if (req.staffId() != null) {
            staffRepository.findByIdAndProviderId(req.staffId(), provider.getId())
                    .orElseThrow(() -> ApiException.badRequest("Staff does not belong to this provider"));
        }

        List<SlotResponse> slots = availabilityService.generateSlots(provider.getId(),
                svc.getId(), req.staffId(), req.date());
        SlotResponse chosen = slots.stream()
                .filter(s -> s.startTime().equals(req.startTime()) && s.endTime().equals(req.endTime()))
                .filter(s -> s.status() == SlotStatus.AVAILABLE)
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("Selected slot is no longer available"));

        double amount = svc.getPrice();
        double discount = 0;
        String couponCode = null;
        if (req.couponCode() != null && !req.couponCode().isBlank()) {
            var validation = couponService.validate(req.couponCode(), amount);
            discount = validation.discount();
            couponCode = validation.code();
            amount = validation.finalAmount();
        }

        Slot slot = slotRepository.findById(chosen.id()).orElse(null);
        String ref = BookingUtils.generateBookingRef();
        Appointment appointment = Appointment.builder()
                .bookingRef(ref)
                .customer(customer)
                .provider(provider)
                .service(svc)
                .staff(req.staffId() == null ? null : staffRepository.findById(req.staffId()).orElse(null))
                .date(req.date())
                .startTime(req.startTime())
                .endTime(req.endTime())
                .status(AppointmentStatus.PENDING)
                .notes(req.notes())
                .amount(svc.getPrice())
                .discount(discount)
                .finalAmount(amount)
                .couponCode(couponCode)
                .build();
        appointment = appointmentRepository.save(appointment);

        if (slot != null) {
            slot.setStatus(SlotStatus.BOOKED);
            slotRepository.save(slot);
        }

        Payment payment = Payment.builder()
                .appointment(appointment)
                .amount(amount)
                .method(req.paymentMethod())
                .status(PaymentStatus.PENDING)
                .build();
        paymentRepository.save(payment);

        if (req.paymentMethod() == PaymentMethod.PAY_AT_VENUE) {
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setPaidAt(LocalDateTime.now());
            paymentRepository.save(payment);
            appointment.setStatus(AppointmentStatus.CONFIRMED);
            appointmentRepository.save(appointment);
            notificationService.bookingConfirmed(appointment);
        }

        notificationService.bookingCreated(appointment);
        return toResponse(appointment);
    }

    @Transactional
    public AppointmentResponse get(Long id) {
        Appointment a = appointmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        Long uid = SecurityUtils.currentUserId();
        boolean isOwner = a.getCustomer().getId().equals(uid);
        boolean isProviderUser = a.getProvider().getUser().getId().equals(uid);
        if (!isOwner && !isProviderUser) {
            throw ApiException.forbidden("You cannot view this appointment");
        }
        return toResponse(a);
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> listMine() {
        return appointmentRepository.findByCustomerIdOrderByDateDescStartTimeDesc(SecurityUtils.currentUserId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> listForProvider() {
        Provider provider = resolveProvider();
        return appointmentRepository.findByProviderIdOrderByDateDescStartTimeDesc(provider.getId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> listForProviderOnDate(LocalDate date) {
        Provider provider = resolveProvider();
        return appointmentRepository.findByProviderIdAndDateOrderByStartTimeAsc(provider.getId(), date)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public AppointmentResponse cancel(Long id, CancelRequest req, boolean asProvider) {
        Appointment a = loadOwned(id, !asProvider, asProvider);
        if (a.getStatus() == AppointmentStatus.COMPLETED && asProvider) {
            throw ApiException.badRequest("Completed appointments cannot be cancelled");
        }
        if (a.getStatus() == AppointmentStatus.CANCELLED) {
            throw ApiException.badRequest("Appointment is already cancelled");
        }
        a.setStatus(AppointmentStatus.CANCELLED);
        a.setCancelReason(req == null ? null : req.reason());
        appointmentRepository.save(a);
        freeSlot(a);
        refundIfPaid(a);
        notificationService.bookingCancelled(a);
        return toResponse(a);
    }

    @Transactional
    public AppointmentResponse reschedule(Long id, RescheduleRequest req) {
        Appointment a = loadOwned(id, true, false);
        if (a.getStatus() == AppointmentStatus.CANCELLED) {
            throw ApiException.badRequest("Cancelled appointments cannot be rescheduled");
        }
        List<SlotResponse> slots = availabilityService.generateSlots(
                a.getProvider().getId(), a.getService().getId(), a.getStaff() == null ? null : a.getStaff().getId(), req.date());
        SlotResponse chosen = slots.stream()
                .filter(s -> s.startTime().equals(req.startTime()) && s.endTime().equals(req.endTime()))
                .filter(s -> s.status() == SlotStatus.AVAILABLE)
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("Requested new slot is not available"));
        freeSlot(a);
        a.setDate(req.date());
        a.setStartTime(req.startTime());
        a.setEndTime(req.endTime());
        a.setStatus(AppointmentStatus.RESCHEDULED);
        appointmentRepository.save(a);
        slotRepository.findById(chosen.id()).ifPresent(s -> {
            s.setStatus(SlotStatus.BOOKED);
            slotRepository.save(s);
        });
        notificationService.notifyUser(a.getCustomer().getId(), "Appointment rescheduled",
                "Your booking " + a.getBookingRef() + " is now on " + a.getDate() + " at " + a.getStartTime() + ".", com.booking.enums.NotifType.BOOKING);
        return toResponse(a);
    }

    @Transactional
    public AppointmentResponse updateStatus(Long id, StatusUpdateRequest req) {
        Appointment a = loadOwned(id, false, true);
        AppointmentStatus target = req.status();
        SetAllowedTransition(a, target);
        a.setStatus(target);
        if (target == AppointmentStatus.NO_SHOW || target == AppointmentStatus.CANCELLED) {
            freeSlot(a);
            if (target == AppointmentStatus.CANCELLED) refundIfPaid(a);
        }
        appointmentRepository.save(a);
        return toResponse(a);
    }

    private void SetAllowedTransition(Appointment a, AppointmentStatus target) {
        AppointmentStatus cur = a.getStatus();
        boolean ok = switch (target) {
            case CONFIRMED -> cur == AppointmentStatus.PENDING || cur == AppointmentStatus.RESCHEDULED;
            case IN_PROGRESS -> cur == AppointmentStatus.CONFIRMED;
            case COMPLETED -> cur == AppointmentStatus.IN_PROGRESS || cur == AppointmentStatus.CONFIRMED;
            case NO_SHOW -> cur == AppointmentStatus.CONFIRMED || cur == AppointmentStatus.PENDING;
            case CANCELLED -> cur != AppointmentStatus.COMPLETED && cur != AppointmentStatus.CANCELLED;
            case RESCHEDULED -> cur == AppointmentStatus.CONFIRMED || cur == AppointmentStatus.PENDING;
            default -> false;
        };
        if (!ok) {
            throw ApiException.badRequest("Cannot transition from " + cur + " to " + target);
        }
    }

    @Transactional(readOnly = true)
    public String getIcs(Long id) {
        AppointmentResponse a = get(id);
        String summary = a.serviceName() + " at " + a.providerName();
        LocalDateTime start = LocalDateTime.of(a.date(), a.startTime());
        LocalDateTime end = LocalDateTime.of(a.date(), a.endTime());
        return BookingUtils.buildIcs(a.bookingRef(), summary, a.date(), start, end,
                a.providerName(), "Appointment " + a.bookingRef());
    }

    private void freeSlot(Appointment a) {
        List<Slot> slots = slotRepository.findByProviderIdAndDateOrderByStartTimeAsc(a.getProvider().getId(), a.getDate());
        slots.stream()
                .filter(s -> s.getStartTime().equals(a.getStartTime()))
                .filter(s -> Objects.equals(s.getStaffId(), a.getStaff() == null ? null : a.getStaff().getId()))
                .filter(s -> s.getStatus() == SlotStatus.BOOKED)
                .forEach(s -> {
                    s.setStatus(SlotStatus.AVAILABLE);
                    slotRepository.save(s);
                });
    }

    private void refundIfPaid(Appointment a) {
        paymentRepository.findByAppointmentId(a.getId()).ifPresent(p -> {
            if (p.getStatus() == PaymentStatus.SUCCESS) {
                p.setStatus(PaymentStatus.REFUNDED);
                p.setRefundId(BookingUtils.generateRefundId());
                paymentRepository.save(p);
            }
        });
    }

    private Appointment loadOwned(Long id, boolean customerCheck, boolean providerCheck) {
        Appointment a = appointmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        Long uid = SecurityUtils.currentUserId();
        boolean isOwner = customerCheck && a.getCustomer().getId().equals(uid);
        boolean isProviderUser = providerCheck && a.getProvider().getUser().getId().equals(uid);
        if (!isOwner && !isProviderUser) {
            throw ApiException.forbidden("You do not have access to this appointment");
        }
        return a;
    }

    private Provider resolveProvider() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    public AppointmentResponse toResponse(Appointment a) {
        Optional<Payment> payment = paymentRepository.findByAppointmentId(a.getId());
        PaymentResponse paymentResponse = payment.map(p -> new PaymentResponse(
                p.getId(), p.getAppointment().getId(), p.getAppointment().getBookingRef(),
                p.getAmount(), p.getMethod(), p.getStatus(), p.getOrderId(), p.getTxnId(),
                p.getRefundId(), p.getPaidAt())).orElse(null);
        return new AppointmentResponse(
                a.getId(), a.getBookingRef(),
                a.getCustomer().getId(), a.getCustomer().getName(), a.getCustomer().getPhotoUrl(),
                a.getProvider().getId(), a.getProvider().getBusinessName(),
                a.getService().getId(), a.getService().getName(),
                a.getStaff() == null ? null : a.getStaff().getId(),
                a.getStaff() == null ? null : a.getStaff().getName(),
                a.getDate(), a.getStartTime(), a.getEndTime(), a.getStatus(),
                a.getNotes(), a.getAmount(), a.getDiscount(), a.getFinalAmount(), a.getCouponCode(),
                a.getCancelReason(), paymentResponse, a.getCreatedAt());
    }
}