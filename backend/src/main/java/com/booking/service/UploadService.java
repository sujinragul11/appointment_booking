package com.booking.service;

import com.booking.dto.response.UploadResponse;
import com.booking.exception.ApiException;
import com.booking.util.BookingUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Image uploads for services, providers and profiles (FR-9, FR-13). Files are validated by
 * content (magic bytes), renamed randomly and stored on local disk / a mounted volume.
 */
@Slf4j
@Service
public class UploadService {

    private static final Map<String, String> TYPES = Map.of("png", "image/png", "jpg", "image/jpeg", "webp", "image/webp", "gif", "image/gif");
    private static final Pattern SAFE_NAME = Pattern.compile("^[A-Za-z0-9_-]{20,64}\\.(png|jpg|webp|gif)$");
    private static final long MAX_BYTES = 2 * 1024 * 1024;

    private final Path dir;

    public UploadService(@Value("${app.uploads.dir:./uploads}") String dir) throws IOException {
        this.dir = Path.of(dir).toAbsolutePath().normalize();
        Files.createDirectories(this.dir);
    }

    public UploadResponse store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Choose an image to upload");
        }
        if (file.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("Image is too large (max 2 MB)");
        }
        String ext;
        try (InputStream in = file.getInputStream()) {
            ext = sniff(in.readNBytes(12));
        } catch (IOException e) {
            throw ApiException.badRequest("Could not read the file");
        }
        if (ext == null) {
            throw ApiException.badRequest("Only PNG, JPEG, WebP or GIF images are allowed");
        }
        String name = BookingUtils.generateToken() + "." + ext;
        try {
            file.transferTo(dir.resolve(name));
        } catch (IOException e) {
            log.error("Upload failed: {}", e.getMessage());
            throw new IllegalStateException("Could not store the file");
        }
        return new UploadResponse("/api/uploads/" + name, name, file.getSize(), TYPES.get(ext));
    }

    public Resource load(String name) {
        if (!SAFE_NAME.matcher(name).matches()) {
            throw ApiException.notFound("File not found");
        }
        Path p = dir.resolve(name).normalize();
        if (!p.startsWith(dir) || !Files.exists(p)) {
            throw ApiException.notFound("File not found");
        }
        return new PathResource(p);
    }

    public static String contentType(String name) {
        return TYPES.getOrDefault(name.substring(name.lastIndexOf('.') + 1), "application/octet-stream");
    }

    static String sniff(byte[] b) {
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "png";
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return "jpg";
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "webp";
        if (b.length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8') return "gif";
        return null;
    }
}
