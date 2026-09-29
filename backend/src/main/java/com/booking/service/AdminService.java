package com.booking.service;

import com.booking.dto.request.AdminProviderDecision;
import com.booking.dto.request.CategoryRequest;
import com.booking.dto.response.*;
import com.booking.entity.Category;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import com.booking.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final ProviderRepository providerRepository;
    private final AppointmentRepository appointmentRepository;
    private final ReviewRepository reviewRepository;
    private final SlotRepository slotRepository;
    private final CategoryRepository categoryRepository;

    public StatsResponse stats() {
        return new StatsResponse(
                userRepository.count(),
                userRepository.countByRole(UserRole.CUSTOMER),
                userRepository.countByRole(UserRole.PROVIDER),
                providerRepository.countByStatus(ProviderStatus.PENDING),
                appointmentRepository.count(),
                appointmentRepository.countByStatus(com.booking.enums.AppointmentStatus.PENDING),
                appointmentRepository.totalRevenue(),
                slotRepository.count(),
                reviewRepository.count());
    }

    public List<ProviderResponse> pendingProviders() {
        return providerRepository.findAll().stream()
                .filter(p -> p.getStatus() == ProviderStatus.PENDING)
                .map(this::toResponseLite).toList();
    }

    public PageResponse<UserResponse> users(int page, int size, String role) {
        Page<User> result;
        if (role != null && !role.isBlank()) {
            result = userRepository.findAll((root, query, cb) ->
                    cb.equal(root.get("role"), UserRole.valueOf(role.toUpperCase())),
                    PageRequest.of(page, size));
        } else {
            result = userRepository.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        }
        List<UserResponse> content = result.getContent().stream().map(UserResponse::of).toList();
        return new PageResponse<>(content, page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public ProviderResponse decideProvider(Long id, AdminProviderDecision decision) {
        Provider p = providerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Provider not found"));
        p.setStatus(decision.status());
        p.setAdminNote(decision.note());
        providerRepository.save(p);
        return toResponseLite(p);
    }

    @Transactional
    public UserResponse toggleUserActive(Long id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        u.setActive(!u.isActive());
        return UserResponse.of(userRepository.save(u));
    }

    public List<CategoryResponse> categories() {
        return categoryRepository.findAllByOrderByNameAsc().stream()
                .map(c -> new CategoryResponse(c.getId(), c.getName(), c.getIcon(), c.getSlug())).toList();
    }

    @Transactional
    public CategoryResponse createCategory(CategoryRequest req) {
        if (categoryRepository.existsByName(req.name())) {
            throw ApiException.conflict("Category already exists");
        }
        Category c = Category.builder()
                .name(req.name())
                .icon(req.icon())
                .slug(req.name().toLowerCase().replace(" ", "-"))
                .build();
        c = categoryRepository.save(c);
        return new CategoryResponse(c.getId(), c.getName(), c.getIcon(), c.getSlug());
    }

    @Transactional
    public void deleteCategory(Long id) {
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