package com.example.storage_api.controller;

import com.example.storage_api.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * API upload và xem ảnh.
 *
 * POST /api/files/images (multipart, field "file"): chỉ FACILITY_MANAGER (người quản lý unit type). Trả { "url": "/api/files/<tên>" }.
 * GET  /api/files/{name}: công khai (SecurityConfig permitAll) để khách xem ảnh kho.
 * URL trả về dán vào field imageUrl của UnitType.
 */
@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;

    @PostMapping("/images")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public ResponseEntity<Map<String, String>> uploadImage(@RequestParam("file") MultipartFile file) {
        String name = fileStorageService.storeImage(file);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("url", "/api/files/" + name));
    }

    @GetMapping("/{name:.+}")
    public ResponseEntity<Resource> getImage(@PathVariable String name) {
        Resource resource = fileStorageService.load(name);
        MediaType type = fileStorageService.mediaTypeOf(name);
        return ResponseEntity.ok()
                .contentType(type)
                // Tên file là UUID không đổi nội dung nên cache lâu được.
                .cacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic())
                .body(resource);
    }
}
