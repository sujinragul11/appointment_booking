package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record CategoryResponse(Long id, String name, String icon, String slug, String description) {}
