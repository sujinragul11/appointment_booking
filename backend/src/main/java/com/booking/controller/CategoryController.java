package com.booking.controller;

import com.booking.dto.response.CategoryResponse;
import com.booking.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final AdminService adminService;

    @GetMapping
    public List<CategoryResponse> list() {
        return adminService.categories();
    }
}