package com.booking.service;

import com.booking.dto.request.CouponRequest;
import com.booking.dto.response.CouponResponse;
import com.booking.dto.response.CouponValidateResponse;
import com.booking.entity.Coupon;
import com.booking.enums.DiscountType;
import com.booking.exception.ApiException;
import com.booking.repository.CouponRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CouponService {

    private final CouponRepository couponRepository;

    public CouponValidateResponse validate(String code, double amount) {
        Coupon c = couponRepository.findByCode(code.trim().toUpperCase())
                .orElseThrow(() -> ApiException.badRequest("Invalid coupon code"));
        if (!c.isActive()) throw ApiException.badRequest("This coupon is inactive");
        LocalDate today = LocalDate.now();
        if (c.getValidFrom() != null && today.isBefore(c.getValidFrom())) throw ApiException.badRequest("Coupon not yet valid");
        if (c.getValidTo() != null && today.isAfter(c.getValidTo())) throw ApiException.badRequest("Coupon has expired");
        if (amount + 0.001 < c.getMinOrder()) {
            throw ApiException.badRequest("Minimum order value for this coupon is " + c.getMinOrder());
        }
        if (c.getUsageLimit() > 0 && c.getUsedCount() >= c.getUsageLimit()) {
            throw ApiException.badRequest("Coupon usage limit reached");
        }
        double discount = c.getDiscountType() == DiscountType.PERCENT
                ? amount * c.getValue() / 100.0
                : c.getValue();
        if (c.getMaxDiscount() > 0) discount = Math.min(discount, c.getMaxDiscount());
        discount = Math.min(discount, amount);
        c.setUsedCount(c.getUsedCount() + 1);
        couponRepository.save(c);
        return new CouponValidateResponse(true, "Coupon applied", c.getCode().toUpperCase(),
                amount, Math.round(discount * 100.0) / 100.0, Math.round((amount - discount) * 100.0) / 100.0);
    }

    @Transactional
    public CouponResponse create(CouponRequest req) {
        if (couponRepository.findByCode(req.code().trim().toUpperCase()).isPresent()) {
            throw ApiException.conflict("Coupon code already exists");
        }
        Coupon c = Coupon.builder()
                .code(req.code().trim().toUpperCase())
                .discountType(req.discountType())
                .value(req.value())
                .minOrder(req.minOrder())
                .maxDiscount(req.maxDiscount())
                .validFrom(req.validFrom())
                .validTo(req.validTo())
                .usageLimit(req.usageLimit())
                .active(req.active() == null || req.active())
                .build();
        return toResponse(couponRepository.save(c));
    }

    @Transactional
    public CouponResponse update(Long id, CouponRequest req) {
        Coupon c = couponRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Coupon not found"));
        couponRepository.findByCode(req.code().trim().toUpperCase())
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> { throw ApiException.conflict("Coupon code already exists"); });
        c.setCode(req.code().trim().toUpperCase());
        c.setDiscountType(req.discountType());
        c.setValue(req.value());
        c.setMinOrder(req.minOrder());
        c.setMaxDiscount(req.maxDiscount());
        c.setValidFrom(req.validFrom());
        c.setValidTo(req.validTo());
        c.setUsageLimit(req.usageLimit());
        if (req.active() != null) c.setActive(req.active());
        return toResponse(couponRepository.save(c));
    }

    @Transactional
    public void delete(Long id) {
        couponRepository.deleteById(id);
    }

    public List<CouponResponse> listAll() {
        return couponRepository.findAll().stream().map(this::toResponse).toList();
    }

    private CouponResponse toResponse(Coupon c) {
        return new CouponResponse(c.getId(), c.getCode(), c.getDiscountType(), c.getValue(),
                c.getMinOrder(), c.getMaxDiscount(), c.getValidFrom(), c.getValidTo(),
                c.getUsageLimit(), c.getUsedCount(), c.isActive(), null);
    }
}