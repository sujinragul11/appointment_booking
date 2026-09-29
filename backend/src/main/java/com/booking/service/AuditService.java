package com.booking.service;

import com.booking.dto.response.AuditLogResponse;
import com.booking.dto.response.PageResponse;
import com.booking.entity.AuditLog;
import com.booking.mapper.DtoMapper;
import com.booking.repository.AuditLogRepository;
import com.booking.security.SecurityUtils;
import com.booking.util.RequestUtils;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Writes the audit trail (FR-48). Audit rows are written in the caller's transaction. */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final DtoMapper mapper;

    @Transactional(propagation = Propagation.REQUIRED)
    public void record(String action, String entityType, Long entityId, String details) {
        var actor = SecurityUtils.current();
        record(actor.map(a -> a.getId()).orElse(null), actor.map(a -> a.getEmail()).orElse(null),
                actor.map(a -> a.getRole().name()).orElse(null), action, entityType, entityId, details);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void record(Long actorId, String actorEmail, String actorRole, String action, String entityType,
                       Long entityId, String details) {
        auditLogRepository.save(AuditLog.builder()
                .actorId(actorId)
                .actorEmail(actorEmail)
                .actorRole(actorRole)
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .details(details == null || details.length() <= 2000 ? details : details.substring(0, 2000))
                .ipAddress(RequestUtils.currentClientIp())
                .build());
        log.info("[AUDIT] {} {}#{} by {} - {}", action, entityType, entityId, actorEmail, details);
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> search(String action, Long actorId, String entityType, LocalDate from,
                                                 LocalDate to, int page, int size) {
        Specification<AuditLog> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (action != null && !action.isBlank()) ps.add(cb.equal(root.get("action"), action.trim().toUpperCase()));
            if (actorId != null) ps.add(cb.equal(root.get("actorId"), actorId));
            if (entityType != null && !entityType.isBlank()) ps.add(cb.equal(root.get("entityType"), entityType.trim()));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay()));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay()));
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Page<AuditLog> result = auditLogRepository.findAll(spec,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by(Sort.Direction.DESC, "id")));
        return PageResponse.of(result, result.getContent().stream().map(mapper::audit).toList());
    }
}
