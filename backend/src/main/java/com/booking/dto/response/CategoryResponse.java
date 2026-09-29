package com.booking.dto.response;

public record CategoryResponse(
        Long id,
        String name,
        String icon,
        String slug
) {}