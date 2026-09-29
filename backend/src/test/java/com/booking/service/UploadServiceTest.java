package com.booking.service;

import com.booking.dto.response.UploadResponse;
import com.booking.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Magic-byte sniffing and local file storage of uploads. */
class UploadServiceTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F'};
    private static final byte[] WEBP = {'R', 'I', 'F', 'F', 36, 0, 0, 0, 'W', 'E', 'B', 'P'};
    private static final byte[] GIF = {'G', 'I', 'F', '8', '9', 'a', 1, 0};

    @TempDir
    Path dir;

    private Path uploads;
    private UploadService service;

    @BeforeEach
    void setUp() throws IOException {
        uploads = dir.resolve("uploads");
        service = new UploadService(uploads.toString());
    }

    private static HttpStatus statusOf(Throwable e) {
        return ((ApiException) e).getStatus();
    }

    // ------------------------------------------------------------------ sniffing

    @Test
    void recognisesImageMagicBytes() {
        assertThat(UploadService.sniff(PNG)).isEqualTo("png");
        assertThat(UploadService.sniff(JPEG)).isEqualTo("jpg");
        assertThat(UploadService.sniff(WEBP)).isEqualTo("webp");
        assertThat(UploadService.sniff(GIF)).isEqualTo("gif");
        assertThat(UploadService.sniff(new byte[]{'G', 'I', 'F', '8', '7', 'a'})).isEqualTo("gif");
    }

    @Test
    void rejectsEverythingElse() {
        assertThat(UploadService.sniff(new byte[0])).isNull();
        assertThat(UploadService.sniff("<svg xmlns=".getBytes(StandardCharsets.US_ASCII))).isNull();
        assertThat(UploadService.sniff("%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII))).isNull();
        assertThat(UploadService.sniff(new byte[]{(byte) 0x89, 'P', 'N', 'G'})).as("too short for PNG").isNull();
        assertThat(UploadService.sniff(new byte[]{(byte) 0xFF, (byte) 0xD8})).as("too short for JPEG").isNull();
        assertThat(UploadService.sniff(new byte[]{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'A', 'V', 'E'})).as("RIFF but not WebP").isNull();
        assertThat(UploadService.sniff(new byte[]{'G', 'I', 'F', '8'})).as("too short for GIF").isNull();
        assertThat(UploadService.sniff(new byte[]{'M', 'Z', (byte) 0x90, 0, 3, 0, 0, 0})).isNull();
    }

    @Test
    void mapsExtensionsToContentTypes() {
        assertThat(UploadService.contentType("a.png")).isEqualTo("image/png");
        assertThat(UploadService.contentType("a.jpg")).isEqualTo("image/jpeg");
        assertThat(UploadService.contentType("a.gif")).isEqualTo("image/gif");
        assertThat(UploadService.contentType("a.webp")).isEqualTo("image/webp");
        assertThat(UploadService.contentType("a.svg")).isEqualTo("application/octet-stream");
    }

    // ------------------------------------------------------------------ storage

    @Test
    void storesUnderARandomNameWithTheSniffedExtension() throws IOException {
        UploadResponse res = service.store(new MockMultipartFile("file", "../../evil.html", "text/html", JPEG));

        assertThat(res.filename()).matches("[A-Za-z0-9_-]{43}\\.jpg");
        assertThat(res.contentType()).isEqualTo("image/jpeg");
        assertThat(res.size()).isEqualTo(JPEG.length);
        assertThat(res.url()).isEqualTo("/api/uploads/" + res.filename());
        assertThat(Files.readAllBytes(uploads.resolve(res.filename()))).isEqualTo(JPEG);

        Resource loaded = service.load(res.filename());
        assertThat(loaded.exists()).isTrue();
        assertThat(loaded.getContentAsByteArray()).isEqualTo(JPEG);
    }

    @Test
    void createsTheUploadDirectory() throws IOException {
        Path nested = dir.resolve("a/b/uploads");
        new UploadService(nested.toString());
        assertThat(nested).isDirectory();
    }

    @Test
    void rejectsMissingEmptyOversizedAndNonImageFiles() {
        assertThatThrownBy(() -> service.store(null)).satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> service.store(new MockMultipartFile("file", new byte[0])))
                .hasMessage("Choose an image to upload");
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        System.arraycopy(PNG, 0, big, 0, PNG.length);
        assertThatThrownBy(() -> service.store(new MockMultipartFile("file", "big.png", "image/png", big)))
                .hasMessage("Image is too large (max 2 MB)");
        assertThatThrownBy(() -> service.store(new MockMultipartFile("file", "x.png", "image/png", "hello".getBytes())))
                .hasMessage("Only PNG, JPEG, WebP or GIF images are allowed");
    }

    @Test
    void readAndWriteFailuresAreReported() throws IOException {
        MultipartFile unreadable = mock(MultipartFile.class);
        when(unreadable.isEmpty()).thenReturn(false);
        when(unreadable.getSize()).thenReturn(10L);
        when(unreadable.getInputStream()).thenThrow(new IOException("disk gone"));
        assertThatThrownBy(() -> service.store(unreadable)).hasMessage("Could not read the file");

        MultipartFile unwritable = mock(MultipartFile.class);
        when(unwritable.isEmpty()).thenReturn(false);
        when(unwritable.getSize()).thenReturn((long) GIF.length);
        when(unwritable.getInputStream()).thenReturn(new ByteArrayInputStream(GIF));
        doThrow(new IOException("read-only")).when(unwritable).transferTo(any(Path.class));
        assertThatThrownBy(() -> service.store(unwritable))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Could not store the file");
    }

    @Test
    void loadOnlyServesSafeExistingNames() throws IOException {
        Files.write(uploads.resolve("secret.txt"), "top secret".getBytes());
        Files.write(dir.resolve("outside-aaaaaaaaaaaaaaaaaaaa.png"), PNG);

        for (String name : new String[]{"secret.txt", "short.png", "../outside-aaaaaaaaaaaaaaaaaaaa.png",
                "..%2Foutside-aaaaaaaaaaaaaaaaaaaa.png", "aaaaaaaaaaaaaaaaaaaaaaaa.png.exe",
                "a".repeat(65) + ".png",
                "aaaaaaaaaaaaaaaaaaaaaaaa.png"}) {
            assertThatThrownBy(() -> service.load(name))
                    .as(name)
                    .isInstanceOf(ApiException.class)
                    .hasMessage("File not found")
                    .satisfies(e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.NOT_FOUND));
        }
    }
}
