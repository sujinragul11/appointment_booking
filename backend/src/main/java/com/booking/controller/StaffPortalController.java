package com.booking.controller;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.StaffResponse;
import com.booking.mapper.DtoMapper;
import com.booking.service.AppointmentService;
import com.booking.service.StaffService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Staff members see and manage only their own appointments. Requires ROLE_STAFF. */
@RestController
@RequestMapping("/api/staff-portal")
@RequiredArgsConstructor
@Tag(name = "Staff portal")
public class StaffPortalController {

    private final StaffService staffService;
    private final AppointmentService appointmentService;
    private final DtoMapper mapper;

    @GetMapping("/me")
    @Transactional(readOnly = true)
    public StaffResponse me() {
        return mapper.staff(staffService.currentStaff());
    }

    @GetMapping("/appointments")
    public List<AppointmentResponse> appointments(@RequestParam(defaultValue = "upcoming") String scope) {
        return appointmentService.forStaff(scope);
    }
}
