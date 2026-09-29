package com.booking.service;

import com.booking.dto.request.ProviderRequest;
import com.booking.dto.response.*;
import com.booking.entity.*;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.ProviderStatus;
import com.booking.exception.ApiException;
import com.booking.repository.*;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProviderService {

    private final ProviderRepository providerRepository;
    private final UserRepository userRepository;
    private final AppointmentRepository appointmentRepository;
    private final ReviewRepository reviewRepository;
    private final BranchRepository branchRepository;
    private final CategoryRepository categoryRepository;
    private final ServiceService serviceService;
    private final StaffService staffService;

    public PageResponse<ProviderResponse> search(String q, Long categoryId, String city,
                                                  Integer minRating, String sort,
                                                  int page, int size) {
        Specification<Provider> spec = (root, query, cb) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            predicates.add(cb.equal(root.get("status"), ProviderStatus.VERIFIED));
            if (city != null && !city.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("city")), city.toLowerCase()));
            }
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            }
            if (minRating != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("rating"), minRating));
            }
            if (q != null && !q.isBlank()) {
                var js = root.join("services", jakarta.persistence.criteria.JoinType.LEFT);
                query.distinct(true);
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("businessName")), "%" + q.toLowerCase() + "%"),
                        cb.like(cb.lower(root.get("city")), "%" + q.toLowerCase() + "%"),
                        cb.like(cb.lower(js.get("name")), "%" + q.toLowerCase() + "%")));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Sort sortObj = switch (sort == null ? "rating" : sort) {
            case "reviewCount" -> Sort.by(Sort.Direction.DESC, "reviewCount");
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt");
            case "name" -> Sort.by(Sort.Direction.ASC, "businessName");
            default -> Sort.by(Sort.Direction.DESC, "rating");
        };
        Page<Provider> pageResult = providerRepository.findAll(spec, PageRequest.of(page, size, sortObj));
        List<ProviderResponse> content = pageResult.getContent().stream().map(this::toResponse).toList();
        return new PageResponse<>(content, page, size, pageResult.getTotalElements(), pageResult.getTotalPages());
    }

    public PageResponse<ProviderResponse> searchUnverified(String q, int page, int size) {
        Specification<Provider> spec = (root, query, cb) -> cb.notEqual(root.get("status"), ProviderStatus.PENDING);
        Page<Provider> result = providerRepository.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        List<ProviderResponse> content = result.getContent().stream().map(this::toResponse).toList();
        return new PageResponse<>(content, page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public ProviderResponse getById(Long id) {
        return toFullResponse(providerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Provider not found")));
    }

    @Transactional(readOnly = true)
    public ProviderResponse getMine() {
        return toFullResponse(resolveCurrentProvider());
    }

    @Transactional
    public ProviderResponse updateProfile(ProviderRequest req) {
        Provider provider = resolveCurrentProvider();
        provider.setBusinessName(req.businessName());
        if (req.description() != null) provider.setDescription(req.description());
        if (req.city() != null) provider.setCity(req.city());
        if (req.state() != null) provider.setState(req.state());
        if (req.country() != null) provider.setCountry(req.country());
        if (req.address() != null) provider.setAddress(req.address());
        if (req.latitude() != null) provider.setLatitude(req.latitude());
        if (req.longitude() != null) provider.setLongitude(req.longitude());
        if (req.phone() != null) provider.setPhone(req.phone());
        if (req.website() != null) provider.setWebsite(req.website());
        if (req.logoUrl() != null) provider.setLogoUrl(req.logoUrl());
        if (req.coverUrl() != null) provider.setCoverUrl(req.coverUrl());
        if (req.maxAdvanceBookingDays() != null) provider.setMaxAdvanceBookingDays(req.maxAdvanceBookingDays());
        if (req.cancellationPolicy() != null) provider.setCancellationPolicy(req.cancellationPolicy());
        if (req.categoryId() != null) {
            provider.setCategory(categoryRepository.findById(req.categoryId()).orElse(null));
        }
        provider = providerRepository.save(provider);
        return toFullResponse(provider);
    }

    public BranchResponse addBranch(String name, String address, String city,
                                    String state, String country, Double lat, Double lng,
                                    String phone, Boolean isMain) {
        Provider p = resolveCurrentProvider();
        Branch b = Branch.builder()
                .provider(p).name(name).address(address).city(city).state(state).country(country)
                .latitude(lat).longitude(lng).phone(phone).main(isMain != null && isMain).build();
        return mapBranch(branchRepository.save(b));
    }

    public void deleteBranch(Long branchId) {
        Branch b = branchRepository.findById(branchId).orElseThrow(() -> ApiException.notFound("Branch not found"));
        if (!b.getProvider().getId().equals(resolveCurrentProvider().getId())) {
            throw ApiException.forbidden("Not your branch");
        }
        branchRepository.deleteById(branchId);
    }

    public List<BranchResponse> listBranches() {
        return branchRepository.findByProviderId(resolveCurrentProvider().getId()).stream()
                .map(this::mapBranch).toList();
    }

    @Transactional
    public ProviderStatsResponse stats() {
        Provider p = resolveCurrentProvider();
        long today = appointmentRepository.countByProviderAndDate(p.getId(), java.time.LocalDate.now());
        long completed = appointmentRepository.findByProviderIdOrderByDateDescStartTimeDesc(p.getId())
                .stream().filter(a -> a.getStatus() == AppointmentStatus.COMPLETED).count();
        long cancelled = appointmentRepository.findByProviderIdOrderByDateDescStartTimeDesc(p.getId())
                .stream().filter(a -> a.getStatus() == AppointmentStatus.CANCELLED).count();
        double revenue = appointmentRepository.providerRevenue(p.getId());
        return new ProviderStatsResponse(today, today, completed, cancelled, revenue,
                p.getRating(), p.getReviewCount(), List.of());
    }

    private Provider resolveCurrentProvider() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    private ProviderResponse toResponse(Provider p) {
        CategoryResponse cat = p.getCategory() != null
                ? new CategoryResponse(p.getCategory().getId(), p.getCategory().getName(), p.getCategory().getIcon(), p.getCategory().getSlug())
                : null;
        return new ProviderResponse(
                p.getId(), p.getBusinessName(), p.getDescription(), p.getLogoUrl(), p.getCoverUrl(),
                cat, p.getCity(), p.getState(), p.getCountry(), p.getAddress(),
                p.getLatitude(), p.getLongitude(), p.getPhone(), p.getWebsite(), p.getStatus(),
                p.getRating(), p.getReviewCount(), p.getMaxAdvanceBookingDays(), p.getCancellationPolicy(),
                p.getCreatedAt(), null, null, null);
    }

    private ProviderResponse toFullResponse(Provider p) {
        CategoryResponse cat = p.getCategory() != null
                ? new CategoryResponse(p.getCategory().getId(), p.getCategory().getName(), p.getCategory().getIcon(), p.getCategory().getSlug())
                : null;
        return new ProviderResponse(
                p.getId(), p.getBusinessName(), p.getDescription(), p.getLogoUrl(), p.getCoverUrl(),
                cat, p.getCity(), p.getState(), p.getCountry(), p.getAddress(),
                p.getLatitude(), p.getLongitude(), p.getPhone(), p.getWebsite(), p.getStatus(),
                p.getRating(), p.getReviewCount(), p.getMaxAdvanceBookingDays(), p.getCancellationPolicy(),
                p.getCreatedAt(),
                serviceService.listByProvider(p.getId(), true),
                staffService.listByProvider(p.getId(), true),
                listBranchesById(p.getId()));
    }

    private List<BranchResponse> listBranchesById(Long providerId) {
        return branchRepository.findByProviderId(providerId).stream().map(this::mapBranch).toList();
    }

    private BranchResponse mapBranch(Branch b) {
        return new BranchResponse(b.getId(), b.getName(), b.getAddress(), b.getCity(), b.getState(),
                b.getCountry(), b.getLatitude(), b.getLongitude(), b.getPhone(), b.isMain());
    }
}