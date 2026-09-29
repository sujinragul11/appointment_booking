package com.booking.service;

import com.booking.dto.request.StaffRequest;
import com.booking.dto.response.StaffResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.entity.User;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.DomainServiceRepository;
import com.booking.repository.StaffRepository;
import com.booking.repository.UserRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Staff members of a provider; optionally with their own STAFF login. */
@Service
@RequiredArgsConstructor
public class StaffService {

    private final StaffRepository staffRepository;
    private final DomainServiceRepository serviceRepository;
    private final UserRepository userRepository;
    private final ProviderService providerService;
    private final AuthService authService;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;
    private final DtoMapper mapper;

    @Transactional(readOnly = true)
    public List<StaffResponse> publicList(Long providerId) {
        return staffRepository.findByProviderIdAndActiveTrueOrderByNameAsc(providerId).stream()
                .filter(s -> s.getProvider().getStatus() == ProviderStatus.VERIFIED)
                .map(mapper::staff).toList();
    }

    @Transactional(readOnly = true)
    public List<StaffResponse> mine() {
        return staffRepository.findByProviderIdOrderByNameAsc(providerService.current().getId()).stream()
                .map(mapper::staff).toList();
    }

    @Transactional
    public StaffResponse create(StaffRequest req) {
        Provider provider = providerService.current();
        Staff s = staffRepository.save(Staff.builder()
                .provider(provider)
                .name(req.name().trim())
                .designation(req.designation())
                .photoUrl(req.photoUrl())
                .bio(req.bio())
                .active(req.active() == null || req.active())
                .build());
        syncServices(provider, s, req.serviceIds());
        if (req.email() != null && !req.email().isBlank()) {
            linkLogin(s, req.email());
        }
        auditService.record("STAFF_CREATED", "Staff", s.getId(), s.getName());
        return mapper.staff(s);
    }

    @Transactional
    public StaffResponse update(Long id, StaffRequest req) {
        Staff s = owned(id);
        s.setName(req.name().trim());
        s.setDesignation(req.designation());
        if (req.photoUrl() != null) s.setPhotoUrl(req.photoUrl().isBlank() ? null : req.photoUrl());
        s.setBio(req.bio());
        if (req.active() != null) {
            s.setActive(req.active());
            if (s.getUser() != null) s.getUser().setActive(req.active());
        }
        if (req.serviceIds() != null) syncServices(s.getProvider(), s, req.serviceIds());
        if (req.email() != null && !req.email().isBlank() && s.getUser() == null) {
            linkLogin(s, req.email());
        }
        auditService.record("STAFF_UPDATED", "Staff", s.getId(), s.getName());
        return mapper.staff(s);
    }

    @Transactional
    public void deactivate(Long id) {
        Staff s = owned(id);
        s.setActive(false);
        if (s.getUser() != null) {
            s.getUser().setActive(false);
            s.getUser().setTokenVersion(s.getUser().getTokenVersion() + 1);
        }
        auditService.record("STAFF_DEACTIVATED", "Staff", s.getId(), s.getName());
    }

    /** The Staff profile of the signed-in STAFF user. */
    @Transactional(readOnly = true)
    public Staff currentStaff() {
        return staffRepository.findByUserId(SecurityUtils.currentUserId())
                .filter(Staff::isActive)
                .orElseThrow(() -> ApiException.forbidden("No active staff profile for this account"));
    }

    private void linkLogin(Staff s, String rawEmail) {
        String email = rawEmail.trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("An account with this e-mail already exists");
        }
        User u = userRepository.save(User.builder()
                .name(s.getName())
                .email(email)
                .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                .role(UserRole.STAFF)
                .build());
        s.setUser(u);
        authService.sendResetLink(u);
        auditService.record("STAFF_LOGIN_CREATED", "Staff", s.getId(), email);
    }

    private void syncServices(Provider provider, Staff s, List<Long> serviceIds) {
        Set<Long> wanted = serviceIds == null ? Set.of() : new HashSet<>(serviceIds);
        for (DomainService svc : serviceRepository.findByProviderIdOrderByNameAsc(provider.getId())) {
            if (wanted.contains(svc.getId())) {
                svc.getStaff().add(s);
                s.getServices().add(svc);
            } else {
                svc.getStaff().remove(s);
                s.getServices().remove(svc);
            }
        }
    }

    private Staff owned(Long id) {
        return staffRepository.findByIdAndProviderId(id, providerService.current().getId())
                .orElseThrow(() -> ApiException.notFound("Staff not found"));
    }
}
