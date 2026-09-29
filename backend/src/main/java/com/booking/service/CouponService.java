package com.booking.service;

import com.booking.dto.request.CouponRequest;
import com.booking.dto.response.CouponResponse;
import com.booking.dto.response.CouponValidateResponse;
import com.booking.entity.Coupon;
import com.booking.enums.DiscountType;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.CouponRepository;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/** Discount coupons: side-effect-free validation, locked redemption at booking time. */
@Service
@RequiredArgsConstructor
public class CouponService {

    private final CouponRepository couponRepository;
    private final AppointmentRepository appointmentRepository;
    private final AuditService auditService;
    private final DtoMapper mapper;

    /** Preview only - does not consume a use. */
    @Transactional(readOnly = true)
    public CouponValidateResponse validate(String code, double amount) {
        Coupon c = couponRepository.findByCodeIgnoreCase(code.trim())
                .orElseThrow(() -> ApiException.badRequest("Invalid coupon code"));
        Long customerId = SecurityUtils.current().map(u -> u.getId()).orElse(null);
        return check(c, amount, customerId);
    }

    /** Validates and consumes one use under a row lock (called inside the booking transaction). */
    @Transactional
    public CouponValidateResponse redeem(String code, double amount, Long customerId) {
        Coupon c = couponRepository.lockByCode(code.trim())
                .orElseThrow(() -> ApiException.badRequest("Invalid coupon code"));
        CouponValidateResponse r = check(c, amount, customerId);
        c.setUsedCount(c.getUsedCount() + 1);
        return r;
    }

    /** Gives a use back when a booking that used the coupon is cancelled before payment. */
    @Transactional
    public void release(String code) {
        if (code == null) return;
        couponRepository.lockByCode(code).ifPresent(c -> c.setUsedCount(Math.max(0, c.getUsedCount() - 1)));
    }

    private CouponValidateResponse check(Coupon c, double amount, Long customerId) {
        LocalDate today = LocalDate.now();
        if (!c.isActive()) throw ApiException.badRequest("This coupon is no longer active");
        if (c.getValidFrom() != null && today.isBefore(c.getValidFrom())) throw ApiException.badRequest("This coupon is not valid yet");
        if (c.getValidTo() != null && today.isAfter(c.getValidTo())) throw ApiException.badRequest("This coupon has expired");
        if (amount + 0.001 < c.getMinOrder()) {
            throw ApiException.badRequest("Minimum order value for this coupon is " + c.getMinOrder());
        }
        if (c.getUsageLimit() > 0 && c.getUsedCount() >= c.getUsageLimit()) {
            throw ApiException.badRequest("This coupon has reached its usage limit");
        }
        if (customerId != null && c.getPerUserLimit() > 0
                && appointmentRepository.countCouponUses(customerId, c.getCode()) >= c.getPerUserLimit()) {
            throw ApiException.badRequest("You have already used this coupon");
        }
        double discount = c.getDiscountType() == DiscountType.PERCENT ? amount * c.getValue() / 100.0 : c.getValue();
        if (c.getMaxDiscount() > 0) discount = Math.min(discount, c.getMaxDiscount());
        discount = BookingUtils.money(Math.min(discount, amount));
        return new CouponValidateResponse(true, "Coupon applied", c.getCode(), amount, discount, BookingUtils.money(amount - discount));
    }

    @Transactional
    public CouponResponse create(CouponRequest req) {
        String code = req.code().trim().toUpperCase();
        if (couponRepository.findByCodeIgnoreCase(code).isPresent()) {
            throw ApiException.conflict("Coupon code already exists");
        }
        Coupon c = Coupon.builder().code(code).build();
        apply(c, req);
        c = couponRepository.save(c);
        auditService.record("COUPON_CREATED", "Coupon", c.getId(), code);
        return mapper.coupon(c);
    }

    @Transactional
    public CouponResponse update(Long id, CouponRequest req) {
        Coupon c = couponRepository.findById(id).orElseThrow(() -> ApiException.notFound("Coupon not found"));
        String code = req.code().trim().toUpperCase();
        couponRepository.findByCodeIgnoreCase(code).filter(o -> !o.getId().equals(id))
                .ifPresent(o -> { throw ApiException.conflict("Coupon code already exists"); });
        c.setCode(code);
        apply(c, req);
        auditService.record("COUPON_UPDATED", "Coupon", id, code);
        return mapper.coupon(c);
    }

    private void apply(Coupon c, CouponRequest req) {
        if (req.discountType() == DiscountType.PERCENT && req.value() > 100) {
            throw ApiException.badRequest("Percentage discount cannot exceed 100");
        }
        if (req.validFrom() != null && req.validTo() != null && req.validTo().isBefore(req.validFrom())) {
            throw ApiException.badRequest("validTo must be on or after validFrom");
        }
        c.setDiscountType(req.discountType());
        c.setValue(req.value());
        c.setMinOrder(req.minOrder());
        c.setMaxDiscount(req.maxDiscount());
        c.setValidFrom(req.validFrom());
        c.setValidTo(req.validTo());
        c.setUsageLimit(req.usageLimit());
        if (req.perUserLimit() != null) c.setPerUserLimit(req.perUserLimit());
        if (req.active() != null) c.setActive(req.active());
    }

    @Transactional
    public void delete(Long id) {
        Coupon c = couponRepository.findById(id).orElseThrow(() -> ApiException.notFound("Coupon not found"));
        couponRepository.delete(c);
        auditService.record("COUPON_DELETED", "Coupon", id, c.getCode());
    }

    @Transactional(readOnly = true)
    public List<CouponResponse> listAll() {
        return couponRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream().map(mapper::coupon).toList();
    }
}
