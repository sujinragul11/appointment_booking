package com.booking.service;

import com.booking.dto.request.ServiceRequest;
import com.booking.dto.response.ServiceResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.exception.ApiException;
import com.booking.repository.CategoryRepository;
import com.booking.repository.DomainServiceRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.StaffRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class ServiceService {

    private final DomainServiceRepository serviceRepository;
    private final ProviderRepository providerRepository;
    private final CategoryRepository categoryRepository;
    private final StaffRepository staffRepository;

    @Transactional(readOnly = true)
    public List<ServiceResponse> listByProvider(Long providerId, boolean includeInactive) {
        List<DomainService> services = includeInactive
                ? serviceRepository.findByProviderId(providerId)
                : serviceRepository.findByProviderIdAndActiveTrue(providerId);
        return services.stream().map(this::toResponse).toList();
    }

    @Transactional
    public ServiceResponse create(ServiceRequest req) {
        Provider provider = provider();
        DomainService s = DomainService.builder()
                .provider(provider)
                .name(req.name())
                .description(req.description())
                .durationMin(req.durationMin())
                .bufferMin(req.bufferMin())
                .price(req.price())
                .category(req.categoryId() == null ? null : categoryRepository.findById(req.categoryId()).orElse(null))
                .imageUrl(req.imageUrl())
                .maxAdvanceBookingDays(req.maxAdvanceBookingDays() == null ? provider.getMaxAdvanceBookingDays() : req.maxAdvanceBookingDays())
                .cancellationPolicy(req.cancellationPolicy() == null ? provider.getCancellationPolicy() : req.cancellationPolicy())
                .active(req.active() == null || req.active())
                .build();
        if (req.staffIds() != null && !req.staffIds().isEmpty()) {
            s.setStaff(new HashSet<>(staffRepository.findAllById(req.staffIds())));
        }
        return toResponse(serviceRepository.save(s));
    }

    @Transactional
    public ServiceResponse update(Long id, ServiceRequest req) {
        DomainService s = ownedService(id);
        s.setName(req.name());
        if (req.description() != null) s.setDescription(req.description());
        s.setDurationMin(req.durationMin());
        s.setBufferMin(req.bufferMin());
        s.setPrice(req.price());
        if (req.categoryId() != null) s.setCategory(categoryRepository.findById(req.categoryId()).orElse(null));
        if (req.imageUrl() != null) s.setImageUrl(req.imageUrl());
        if (req.maxAdvanceBookingDays() != null) s.setMaxAdvanceBookingDays(req.maxAdvanceBookingDays());
        if (req.cancellationPolicy() != null) s.setCancellationPolicy(req.cancellationPolicy());
        if (req.active() != null) s.setActive(req.active());
        if (req.staffIds() != null) {
            s.setStaff(new HashSet<>(staffRepository.findAllById(req.staffIds())));
        }
        return toResponse(serviceRepository.save(s));
    }

    @Transactional
    public void delete(Long id) {
        DomainService s = ownedService(id);
        s.setActive(false);
        serviceRepository.save(s);
    }

    private DomainService ownedService(Long id) {
        DomainService s = serviceRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Service not found"));
        if (!s.getProvider().getId().equals(provider().getId())) {
            throw ApiException.forbidden("Not your service");
        }
        return s;
    }

    private Provider provider() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    public ServiceResponse toResponse(DomainService s) {
        List<Long> staffIds = s.getStaff().stream().map(Staff::getId).toList();
        List<String> staffNames = s.getStaff().stream().map(Staff::getName).toList();
        return new ServiceResponse(
                s.getId(), s.getProvider().getId(), s.getName(), s.getDescription(),
                s.getDurationMin(), s.getBufferMin(), s.getPrice(),
                s.getCategory() != null ? s.getCategory().getId() : null,
                s.getCategory() != null ? s.getCategory().getName() : null,
                s.getImageUrl(), s.getMaxAdvanceBookingDays(), s.getCancellationPolicy(),
                s.isActive(), staffIds, staffNames);
    }
}