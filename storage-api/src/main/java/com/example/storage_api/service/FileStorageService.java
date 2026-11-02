package com.example.storage_api.service;

import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Lưu và đọc ảnh upload trên đĩa (thư mục cấu hình bởi app.upload.dir).
 *
 * An toàn:
 *  - Loại ảnh được xác định bằng "magic bytes" (vài byte đầu của file), không tin tên file hay Content-Type client gửi.
 *  - Chỉ nhận JPEG / PNG / GIF / WebP. Không nhận SVG vì SVG có thể chứa script.
 *  - Tên file lưu là UUID + đuôi do server quyết định, nên không thể ghi đè file khác hoặc chui ra ngoài thư mục (path traversal).
 */
@Service
public class FileStorageService {

    private static final long MAX_BYTES = 5L * 1024 * 1024;
    // Tên file hợp lệ do chính server sinh ra. Mọi tên khác (vd "../x") đều bị từ chối khi đọc.
    private static final Pattern STORED_NAME = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|gif|webp)$");

    private final Path root;

    public FileStorageService(@Value("${app.upload.dir:uploads}") String dir) {
        this.root = Paths.get(dir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create upload directory: " + root, e);
        }
    }

    /** Lưu ảnh, trả về tên file đã lưu (UUID.đuôi). */
    public String storeImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Image file is required");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("Image must be at most 5MB");
        }
        String ext;
        try (InputStream in = file.getInputStream()) {
            ext = detectExtension(in.readNBytes(12));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (ext == null) {
            throw new BadRequestException("Only JPEG, PNG, GIF or WebP images are allowed");
        }
        String name = UUID.randomUUID() + "." + ext;
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, root.resolve(name), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot store file", e);
        }
        return name;
    }

    public Resource load(String name) {
        if (name == null || !STORED_NAME.matcher(name).matches()) {
            throw new ResourceNotFoundException("Image not found");
        }
        Path path = root.resolve(name).normalize();
        if (!path.startsWith(root) || !Files.isRegularFile(path)) {
            throw new ResourceNotFoundException("Image not found");
        }
        return new FileSystemResource(path);
    }

    public MediaType mediaTypeOf(String name) {
        return switch (name.substring(name.lastIndexOf('.') + 1)) {
            case "png" -> MediaType.IMAGE_PNG;
            case "gif" -> MediaType.IMAGE_GIF;
            case "webp" -> MediaType.parseMediaType("image/webp");
            default -> MediaType.IMAGE_JPEG;
        };
    }

    // Nhận diện định dạng qua vài byte đầu. Trả null nếu không phải ảnh được phép.
    private static String detectExtension(byte[] h) {
        if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) return "jpg";
        if (h.length >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return "png";
        if (h.length >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return "gif";
        if (h.length >= 12 && Arrays.equals(Arrays.copyOfRange(h, 0, 4), new byte[]{'R', 'I', 'F', 'F'})
                && Arrays.equals(Arrays.copyOfRange(h, 8, 12), new byte[]{'W', 'E', 'B', 'P'})) return "webp";
        return null;
    }
}
