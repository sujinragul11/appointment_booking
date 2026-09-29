package com.booking.service;

import com.booking.dto.request.StaffRequest;
import com.booking.dto.response.StaffResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.exception.ApiException;
import com.booking.repository.DomainServiceRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.StaffRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StaffService {

    private final StaffRepository staffRepository;
    private final ProviderRepository providerRepository;
    private final DomainServiceRepository serviceRepository;

    @Transactional(readOnly = true)
    public List<StaffResponse> listByProvider(Long providerId, boolean includeInactive) {
        List<Staff> staff = includeInactive
                ? staffRepository.findByProviderId(providerId)
                : staffRepository.findByProviderIdAndActiveTrue(providerId);
        return staff.stream().map(this::toResponse).toList();
    }

    @Transactional
    public StaffResponse create(StaffRequest req) {
        Provider provider = provider();
        Staff s = Staff.builder()
                .provider(provider)
                .name(req.name())
                .designation(req.designation())
                .photoUrl(req.photoUrl())
                .bio(req.bio())
                .active(req.active() == null || req.active())
                .build();
        if (req.serviceIds() != null && !req.serviceIds().isEmpty()) {
            for (DomainService svc : serviceRepository.findByProviderId(provider.getId())) {
                if (req.serviceIds().contains(svc.getId())) {
                    svc.getStaff().add(s);
                }
            }
        }
        s = staffRepository.save(s);
        syncServiceLinks(provider, s, req.serviceIds());
        return toResponse(s);
    }

    @Transactional
    public StaffResponse update(Long id, StaffRequest req) {
        Staff s = owned(id);
        s.setName(req.name());
        if (req.designation() != null) s.setDesignation(req.designation());
        if (req.photoUrl() != null) s.setPhotoUrl(req.photoUrl());
        if (req.bio() != null) s.setBio(req.bio());
        if (req.active() != null) s.setActive(req.active());
        s = staffRepository.save(s);
        syncServiceLinks(s.getProvider(), s, req.serviceIds());
        return toResponse(s);
    }

    @Transactional
    public void delete(Long id) {
        Staff s = owned(id);
        s.setActive(false);
        staffRepository.save(s);
    }

    private void syncServiceLinks(Provider provider, Staff s, List<Long> serviceIds) {
        for (DomainService svc : serviceRepository.findByProviderId(provider.getId())) {
            if (serviceIds != null && serviceIds.contains(svc.getId())) {
                if (!svc.getStaff().contains(s)) svc.getStaff().add(s);
            } else {
                svc.getStaff().remove(s);
            }
        }
    }

    private Staff owned(Long id) {
        Staff s = staffRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Staff not found"));
        if (!s.getProvider().getId().equals(provider().getId())) {
            throw ApiException.forbidden("Not your staff");
        }
        return s;
    }

    private Provider provider() {
        return providerRepository.findByUserId(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Provider profile not found"));
    }

    public StaffResponse toResponse(Staff s) {
        List<Long> serviceIds = s.getServices().stream().map(DomainService::getId).toList();
        return new StaffResponse(s.getId(), s.getProvider().getId(), s.getName(), s.getDesignation(),
                s.getPhotoUrl(), s.getBio(), s.isActive(), serviceIds);
    }
}