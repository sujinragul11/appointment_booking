package com.booking.service;

import com.booking.dto.request.ReviewRequest;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.ReviewResponse;
import com.booking.entity.Appointment;
import com.booking.entity.Provider;
import com.booking.entity.Review;
import com.booking.enums.AppointmentStatus;
import com.booking.exception.ApiException;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.ReviewRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final AppointmentRepository appointmentRepository;
    private final ProviderRepository providerRepository;

    @Transactional(readOnly = true)
    public List<ReviewResponse> listByProvider(Long providerId) {
        return reviewRepository.findByProviderIdOrderByCreatedAtDesc(providerId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public ReviewResponse create(ReviewRequest req) {
        Appointment a = appointmentRepository.findById(req.appointmentId())
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        if (!a.getCustomer().getId().equals(SecurityUtils.currentUserId())) {
            throw ApiException.forbidden("Only the customer can review this appointment");
        }
        if (a.getStatus() != AppointmentStatus.COMPLETED) {
            throw ApiException.badRequest("You can review only after a completed appointment");
        }
        if (reviewRepository.findByAppointmentId(a.getId()).isPresent()) {
            throw ApiException.conflict("You already reviewed this appointment");
        }
        Review review = Review.builder()
                .appointment(a)
                .customer(a.getCustomer())
                .provider(a.getProvider())
                .rating(req.rating())
                .comment(req.comment())
                .build();
        review = reviewRepository.save(review);
        recomputeProviderRating(a.getProvider().getId());
        return toResponse(review);
    }

    @Transactional
    public ReviewResponse reply(Long reviewId, String reply) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> ApiException.notFound("Review not found"));
        Provider provider = providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.forbidden("Only providers can reply"));
        if (!review.getProvider().getId().equals(provider.getId())) {
            throw ApiException.forbidden("Not your review");
        }
        review.setReply(reply);
        review.setReplyAt(LocalDateTime.now());
        return toResponse(reviewRepository.save(review));
    }

    @Transactional
    public MessageResponse flag(Long reviewId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> ApiException.notFound("Review not found"));
        review.setFlagged(true);
        reviewRepository.save(review);
        return new MessageResponse("Review flagged for moderation");
    }

    private void recomputeProviderRating(Long providerId) {
        Provider p = providerRepository.findById(providerId)
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        double avg = reviewRepository.avgRating(providerId);
        long count = reviewRepository.countByProviderId(providerId);
        p.setRating(Math.round(avg * 10.0) / 10.0);
        p.setReviewCount((int) count);
        providerRepository.save(p);
    }

    public ReviewResponse toResponse(Review r) {
        return new ReviewResponse(r.getId(), r.getAppointment().getId(),
                r.getCustomer().getId(), r.getCustomer().getName(), r.getCustomer().getPhotoUrl(),
                r.getRating(), r.getComment(), r.getReply(), r.getReplyAt(), r.getCreatedAt());
    }
}