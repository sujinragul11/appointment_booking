package com.booking.service;

import com.booking.dto.request.ServiceRequest;
import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ServiceResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.enums.ProviderStatus;
import com.booking.enums.ServiceMode;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.*;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/**
 * Services offered on the platform: public browsing/search (FR-18, FR-49), provider
 * self-management, and admin CRUD / assignment / enable-disable (FR-9..11).
 */
@Service
@RequiredArgsConstructor
public class CatalogService {

    private final DomainServiceRepository serviceRepository;
    private final ProviderRepository providerRepository;
    private final CategoryRepository categoryRepository;
    private final StaffRepository staffRepository;
    private final ProviderService providerService;
    private final AuditService auditService;
    private final DtoMapper mapper;

    public record Filter(String q, Long categoryId, Long providerId, Double minPrice, Double maxPrice,
                         ServiceMode mode, String city, Boolean active, String sort) {}

    /** Public listing: active services of verified providers. */
    @Transactional(readOnly = true)
    public PageResponse<ServiceResponse> browse(Filter f, int page, int size) {
        return find(new Filter(f.q(), f.categoryId(), f.providerId(), f.minPrice(), f.maxPrice(), f.mode(), f.city(), true, f.sort()),
                true, page, size);
    }

    @Transactional(readOnly = true)
    public PageResponse<ServiceResponse> adminSearch(Filter f, int page, int size) {
        return find(f, false, page, size);
    }

    private PageResponse<ServiceResponse> find(Filter f, boolean verifiedOnly, int page, int size) {
        Specification<DomainService> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            Join<DomainService, Provider> p = root.join("provider");
            if (verifiedOnly) ps.add(cb.equal(p.get("status"), ProviderStatus.VERIFIED));
            if (f.active() != null) ps.add(cb.equal(root.get("active"), f.active()));
            if (f.providerId() != null) ps.add(cb.equal(p.get("id"), f.providerId()));
            if (f.categoryId() != null) ps.add(cb.equal(root.get("category").get("id"), f.categoryId()));
            if (f.minPrice() != null) ps.add(cb.greaterThanOrEqualTo(root.get("price"), f.minPrice()));
            if (f.maxPrice() != null) ps.add(cb.lessThanOrEqualTo(root.get("price"), f.maxPrice()));
            if (f.mode() != null && f.mode() != ServiceMode.BOTH) {
                ps.add(cb.or(cb.equal(root.get("mode"), f.mode()), cb.equal(root.get("mode"), ServiceMode.BOTH)));
            }
            if (f.city() != null && !f.city().isBlank()) {
                ps.add(cb.equal(cb.lower(p.get("city")), f.city().trim().toLowerCase()));
            }
            if (f.q() != null && !f.q().isBlank()) {
                String like = "%" + f.q().trim().toLowerCase() + "%";
                var cat = root.join("category", JoinType.LEFT);
                ps.add(cb.or(cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("description"), "")), like),
                        cb.like(cb.lower(p.get("businessName")), like),
                        cb.like(cb.lower(cb.coalesce(cat.get("name"), "")), like)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Sort sort = switch (f.sort() == null ? "name" : f.sort()) {
            case "priceAsc" -> Sort.by("price").ascending();
            case "priceDesc" -> Sort.by("price").descending();
            case "duration" -> Sort.by("durationMin").ascending();
            case "rating" -> Sort.by(Sort.Direction.DESC, "provider.rating");
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt");
            default -> Sort.by("name").ascending();
        };
        Page<DomainService> result = serviceRepository.findAll(spec,
                PageRequest.of(Math.max(page, 0), ProviderService.clamp(size), sort.and(Sort.by("id"))));
        return PageResponse.of(result, result.getContent().stream().map(mapper::service).toList());
    }

    @Transactional(readOnly = true)
    public List<ServiceResponse> listForProvider(Long providerId) {
        return serviceRepository.findByProviderIdAndActiveTrueOrderByNameAsc(providerId).stream()
                .filter(s -> s.getProvider().getStatus() == ProviderStatus.VERIFIED)
                .map(mapper::service).toList();
    }

    @Transactional(readOnly = true)
    public ServiceResponse getPublic(Long id) {
        DomainService s = serviceRepository.findById(id)
                .filter(x -> x.isActive() && x.getProvider().getStatus() == ProviderStatus.VERIFIED)
                .orElseThrow(() -> ApiException.notFound("Service not found"));
        return mapper.service(s);
    }

    // ------------------------------------------------------------------ provider self-service

    @Transactional(readOnly = true)
    public List<ServiceResponse> mine() {
        return serviceRepository.findByProviderIdOrderByNameAsc(providerService.current().getId()).stream()
                .map(mapper::service).toList();
    }

    @Transactional
    public ServiceResponse createMine(ServiceRequest req) {
        return create(providerService.current(), req);
    }

    @Transactional
    public ServiceResponse updateMine(Long id, ServiceRequest req) {
        DomainService s = owned(id);
        return update(s, req);
    }

    @Transactional
    public ServiceResponse setActiveMine(Long id, boolean active) {
        DomainService s = owned(id);
        s.setActive(active);
        auditService.record(active ? "SERVICE_ENABLED" : "SERVICE_DISABLED", "Service", id, s.getName());
        return mapper.service(s);
    }

    // ------------------------------------------------------------------ admin (FR-9, FR-10, FR-11)

    @Transactional
    public ServiceResponse adminCreate(ServiceRequest req) {
        if (req.providerId() == null) {
            throw ApiException.badRequest("providerId is required");
        }
        return create(providerRepository.findById(req.providerId())
                .orElseThrow(() -> ApiException.badRequest("Provider not found")), req);
    }

    @Transactional
    public ServiceResponse adminUpdate(Long id, ServiceRequest req) {
        DomainService s = serviceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Service not found"));
        if (req.providerId() != null && !req.providerId().equals(s.getProvider().getId())) {
            reassign(s, req.providerId());
        }
        return update(s, req);
    }

    @Transactional
    public ServiceResponse adminSetActive(Long id, boolean active) {
        DomainService s = serviceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Service not found"));
        s.setActive(active);
        auditService.record(active ? "SERVICE_ENABLED" : "SERVICE_DISABLED", "Service", id, s.getName());
        return mapper.service(s);
    }

    /** Assigns a copy of a service (same name, price, duration...) to another provider (FR-10). */
    @Transactional
    public ServiceResponse assignCopy(Long id, Long providerId) {
        DomainService src = serviceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Service not found"));
        Provider target = providerRepository.findById(providerId).orElseThrow(() -> ApiException.badRequest("Provider not found"));
        if (target.getId().equals(src.getProvider().getId())) {
            throw ApiException.badRequest("Service already belongs to this provider");
        }
        DomainService copy = serviceRepository.save(DomainService.builder()
                .provider(target).name(src.getName()).description(src.getDescription())
                .durationMin(src.getDurationMin()).bufferMin(src.getBufferMin()).price(src.getPrice())
                .depositPercent(src.getDepositPercent()).mode(src.getMode()).category(src.getCategory())
                .imageUrl(src.getImageUrl()).maxAdvanceBookingDays(src.getMaxAdvanceBookingDays())
                .active(true).build());
        auditService.record("SERVICE_ASSIGNED", "Service", copy.getId(),
                "Copied from service #" + src.getId() + " to provider #" + providerId);
        return mapper.service(copy);
    }

    /** Deletes a service that was never booked; otherwise it is disabled to keep booking history intact. */
    @Transactional
    public void adminDelete(Long id) {
        DomainService s = serviceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Service not found"));
        try {
            serviceRepository.delete(s);
            serviceRepository.flush();
            auditService.record("SERVICE_DELETED", "Service", id, s.getName());
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw ApiException.conflict("Service has bookings; disable it instead of deleting");
        }
    }

    // ------------------------------------------------------------------ shared

    private ServiceResponse create(Provider provider, ServiceRequest req) {
        DomainService s = DomainService.builder().provider(provider).build();
        apply(s, req);
        s.setActive(req.active() == null || req.active());
        s = serviceRepository.save(s);
        auditService.record("SERVICE_CREATED", "Service", s.getId(), s.getName() + " for provider #" + provider.getId());
        return mapper.service(s);
    }

    private ServiceResponse update(DomainService s, ServiceRequest req) {
        apply(s, req);
        if (req.active() != null) s.setActive(req.active());
        auditService.record("SERVICE_UPDATED", "Service", s.getId(), s.getName());
        return mapper.service(s);
    }

    private void apply(DomainService s, ServiceRequest req) {
        s.setName(req.name().trim());
        s.setDescription(req.description());
        s.setDurationMin(req.durationMin());
        s.setBufferMin(req.bufferMin());
        s.setPrice(req.price());
        if (req.depositPercent() != null) s.setDepositPercent(req.depositPercent());
        if (req.mode() != null) s.setMode(req.mode());
        s.setCategory(req.categoryId() == null ? null
                : categoryRepository.findById(req.categoryId()).orElseThrow(() -> ApiException.badRequest("Unknown category")));
        if (req.imageUrl() != null) s.setImageUrl(req.imageUrl().isBlank() ? null : req.imageUrl());
        if (req.maxAdvanceBookingDays() != null) s.setMaxAdvanceBookingDays(req.maxAdvanceBookingDays());
        if (req.staffIds() != null) {
            List<Staff> staff = staffRepository.findAllById(req.staffIds());
            if (staff.size() != new HashSet<>(req.staffIds()).size()
                    || staff.stream().anyMatch(st -> !st.getProvider().getId().equals(s.getProvider().getId()))) {
                throw ApiException.badRequest("Staff must belong to the same provider");
            }
            s.setStaff(new HashSet<>(staff));
        }
    }

    private void reassign(DomainService s, Long providerId) {
        Provider target = providerRepository.findById(providerId).orElseThrow(() -> ApiException.badRequest("Provider not found"));
        s.setProvider(target);
        s.getStaff().clear();
        auditService.record("SERVICE_REASSIGNED", "Service", s.getId(), "to provider #" + providerId);
    }

    private DomainService owned(Long id) {
        Long providerId = providerService.current().getId();
        return serviceRepository.findById(id)
                .filter(s -> s.getProvider().getId().equals(providerId))
                .orElseThrow(() -> ApiException.notFound("Service not found"));
    }
}
