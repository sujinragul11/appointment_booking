package com.booking.service;

import com.booking.dto.request.ModerateReviewRequest;
import com.booking.dto.request.ReviewRequest;
import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ReviewResponse;
import com.booking.entity.Appointment;
import com.booking.entity.Provider;
import com.booking.entity.Review;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.NotifType;
import com.booking.enums.ReviewStatus;
import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.ReviewRepository;
import com.booking.repository.UserRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/** Ratings & reviews with moderation (FR-41..43). */
@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final AppointmentRepository appointmentRepository;
    private final ProviderRepository providerRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final DtoMapper mapper;

    /** Public: approved reviews only. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> publicList(Long providerId) {
        return reviewRepository.findByProviderIdAndStatusOrderByCreatedAtDesc(providerId, ReviewStatus.APPROVED)
                .stream().map(mapper::review).toList();
    }

    /** Provider's own view: all reviews including pending ones. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> mine() {
        Provider p = providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
        return reviewRepository.findByProviderIdOrderByCreatedAtDesc(p.getId()).stream().map(mapper::review).toList();
    }

    @Transactional
    public ReviewResponse create(ReviewRequest req) {
        Appointment a = appointmentRepository.findById(req.appointmentId())
                .filter(x -> x.getCustomer().getId().equals(SecurityUtils.currentUserId()))
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        if (a.getStatus() != AppointmentStatus.COMPLETED) {
            throw ApiException.badRequest("You can review an appointment once it is completed");
        }
        if (reviewRepository.findByAppointmentId(a.getId()).isPresent()) {
            throw ApiException.conflict("You already reviewed this appointment");
        }
        String comment = req.comment() == null || req.comment().isBlank() ? null : req.comment().trim();
        Review r = reviewRepository.save(Review.builder()
                .appointment(a).customer(a.getCustomer()).provider(a.getProvider())
                .rating(req.rating()).comment(comment)
                // rating-only reviews need no moderation; written ones are checked first
                .status(comment == null ? ReviewStatus.APPROVED : ReviewStatus.PENDING)
                .build());
        if (r.getStatus() == ReviewStatus.APPROVED) {
            recompute(a.getProvider());
        } else {
            userRepository.findByRoleAndActiveTrueAndDeletedFalse(UserRole.ADMIN).forEach(admin ->
                    notificationService.inApp(admin, "Review awaiting moderation",
                            a.getCustomer().getName() + " reviewed " + a.getProvider().getBusinessName() + ".",
                            NotifType.REVIEW, "/dashboard/admin/reviews"));
        }
        auditService.record("REVIEW_CREATED", "Review", r.getId(), a.getBookingRef() + " rating " + req.rating());
        return mapper.review(r);
    }

    @Transactional
    public ReviewResponse reply(Long reviewId, String reply) {
        Provider p = providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.forbidden("Only providers can reply"));
        Review r = reviewRepository.findById(reviewId).filter(x -> x.getProvider().getId().equals(p.getId()))
                .orElseThrow(() -> ApiException.notFound("Review not found"));
        r.setReply(reply.trim());
        r.setReplyAt(LocalDateTime.now());
        notificationService.inApp(r.getCustomer(), "The provider replied to your review",
                p.getBusinessName() + " replied to your review.", NotifType.REVIEW, "/providers/" + p.getId());
        return mapper.review(r);
    }

    /** Anyone signed in can report a review; it goes back to the moderation queue. */
    @Transactional
    public void flag(Long reviewId, String reason) {
        Review r = reviewRepository.findById(reviewId).orElseThrow(() -> ApiException.notFound("Review not found"));
        if (!r.isFlagged()) {
            r.setFlagged(true);
            r.setFlagReason(reason == null || reason.isBlank() ? "Reported" : reason.trim());
            auditService.record("REVIEW_FLAGGED", "Review", reviewId, r.getFlagReason());
        }
    }

    @Transactional(readOnly = true)
    public PageResponse<ReviewResponse> moderationQueue(String filter, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Review> result = switch (filter == null ? "PENDING" : filter.toUpperCase()) {
            case "FLAGGED" -> reviewRepository.findByFlaggedTrue(pr);
            case "APPROVED" -> reviewRepository.findByStatus(ReviewStatus.APPROVED, pr);
            case "REJECTED" -> reviewRepository.findByStatus(ReviewStatus.REJECTED, pr);
            case "ALL" -> reviewRepository.findAll(pr);
            default -> reviewRepository.findByStatus(ReviewStatus.PENDING, pr);
        };
        return PageResponse.of(result, result.getContent().stream().map(mapper::review).toList());
    }

    @Transactional
    public ReviewResponse moderate(Long id, ModerateReviewRequest req) {
        if (req.status() == ReviewStatus.PENDING) {
            throw ApiException.badRequest("Choose APPROVED or REJECTED");
        }
        Review r = reviewRepository.findById(id).orElseThrow(() -> ApiException.notFound("Review not found"));
        r.setStatus(req.status());
        r.setModerationNote(req.note());
        r.setModeratedAt(LocalDateTime.now());
        r.setFlagged(false);
        recompute(r.getProvider());
        auditService.record("REVIEW_" + req.status(), "Review", id, req.note());
        if (req.status() == ReviewStatus.REJECTED) {
            notificationService.inApp(r.getCustomer(), "Review not published",
                    "Your review of " + r.getProvider().getBusinessName() + " did not meet our guidelines."
                            + (req.note() == null ? "" : " Note: " + req.note()), NotifType.REVIEW, null);
        }
        return mapper.review(r);
    }

    /** Average of approved reviews shown on the provider profile (FR-43). */
    private void recompute(Provider p) {
        reviewRepository.flush();
        double avg = reviewRepository.approvedAverage(p.getId());
        p.setRating(Math.round(avg * 10.0) / 10.0);
        p.setReviewCount((int) reviewRepository.approvedCount(p.getId()));
    }
}
