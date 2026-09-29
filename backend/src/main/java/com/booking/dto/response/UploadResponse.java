package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record UploadResponse(String url, String filename, long size, String contentType) {}
