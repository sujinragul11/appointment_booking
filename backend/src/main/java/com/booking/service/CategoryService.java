package com.booking.service;

import com.booking.dto.request.CategoryRequest;
import com.booking.dto.response.CategoryResponse;
import com.booking.entity.Category;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.repository.CategoryRepository;
import com.booking.repository.DomainServiceRepository;
import com.booking.repository.ProviderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.List;

/** Service categories (FR-12). */
@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final DomainServiceRepository serviceRepository;
    private final ProviderRepository providerRepository;
    private final AuditService auditService;
    private final DtoMapper mapper;

    @Cacheable("categories")
    @Transactional(readOnly = true)
    public List<CategoryResponse> list() {
        return categoryRepository.findAllByOrderByNameAsc().stream().map(mapper::category).toList();
    }

    @CacheEvict(value = "categories", allEntries = true)
    @Transactional
    public CategoryResponse create(CategoryRequest req) {
        if (categoryRepository.existsByNameIgnoreCase(req.name().trim())) {
            throw ApiException.conflict("Category already exists");
        }
        Category c = categoryRepository.save(Category.builder()
                .name(req.name().trim())
                .icon(req.icon())
                .description(req.description())
                .slug(uniqueSlug(req.name(), null))
                .build());
        auditService.record("CATEGORY_CREATED", "Category", c.getId(), c.getName());
        return mapper.category(c);
    }

    @CacheEvict(value = "categories", allEntries = true)
    @Transactional
    public CategoryResponse update(Long id, CategoryRequest req) {
        Category c = categoryRepository.findById(id).orElseThrow(() -> ApiException.notFound("Category not found"));
        categoryRepository.findByNameIgnoreCase(req.name().trim())
                .filter(o -> !o.getId().equals(id))
                .ifPresent(o -> { throw ApiException.conflict("Category already exists"); });
        c.setName(req.name().trim());
        c.setIcon(req.icon());
        c.setDescription(req.description());
        c.setSlug(uniqueSlug(req.name(), id));
        auditService.record("CATEGORY_UPDATED", "Category", id, c.getName());
        return mapper.category(c);
    }

    @CacheEvict(value = "categories", allEntries = true)
    @Transactional
    public void delete(Long id) {
        Category c = categoryRepository.findById(id).orElseThrow(() -> ApiException.notFound("Category not found"));
        if (serviceRepository.existsByCategoryId(id)
                || providerRepository.count((root, q, cb) -> cb.equal(root.get("category").get("id"), id)) > 0) {
            throw ApiException.conflict("Category is in use by providers or services; reassign them first");
        }
        categoryRepository.delete(c);
        auditService.record("CATEGORY_DELETED", "Category", id, c.getName());
    }

    private String uniqueSlug(String name, Long selfId) {
        String base = Normalizer.normalize(name.trim().toLowerCase(), Normalizer.Form.NFD)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (base.isEmpty()) base = "category";
        String slug = base;
        int i = 2;
        while (true) {
            var existing = categoryRepository.findBySlug(slug);
            if (existing.isEmpty() || existing.get().getId().equals(selfId)) return slug;
            slug = base + "-" + i++;
        }
    }
}
