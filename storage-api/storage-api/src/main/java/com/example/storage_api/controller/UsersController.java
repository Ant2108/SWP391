package com.example.storage_api.controller;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.exception.AppException;
import com.example.storage_api.model.reponse.UserDetailResponse;
import com.example.storage_api.model.request.*;
import com.example.storage_api.reponsitory.RefreshTokenRepository;
import com.example.storage_api.security.JwtService;
import com.example.storage_api.entity.RefreshToken;
import com.example.storage_api.model.reponse.LoginResponse;
import com.example.storage_api.service.RefreshTokenService;
import com.example.storage_api.service.UsersService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class UsersController {

    private final UsersService usersService;
    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenService refreshTokenService;
    private final JwtService jwtService;


    // =========================
    // REGISTER
    // =========================

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody UsersRequest request) {
        return ResponseEntity.ok(usersService.register(request));
    }


    // =========================
    // LOGIN
    // =========================

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = usersService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refreshToken(@RequestBody RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenRepository
                .findByToken(request.getRefreshToken())
                .orElseThrow(() ->
                        new AppException(HttpStatus.UNAUTHORIZED, "Refresh token not found"));

        refreshTokenService.verifyExpiration(refreshToken);
        if (refreshToken.getUser().getStatus() != Status.ACTIVE) {
            throw new AppException(HttpStatus.FORBIDDEN, "Account is inactive");
        }
        String accessToken = jwtService.generateToken(refreshToken.getUser());
        return ResponseEntity.ok(
                java.util.Map.of(
                        "accessToken", accessToken,
                        "tokenType", "Bearer"
                )
        );
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestBody RefreshTokenRequest request) {
        usersService.logout(request.getRefreshToken());
        return ResponseEntity.ok(
                java.util.Map.of("message", "Logout successful")
        );
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        String email = authentication.getName();
        return ResponseEntity.ok(usersService.getMyProfile(email));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMyProfile(Authentication authentication,
                                             @Valid @RequestBody AdminUpdateUserRequest request) {
        return ResponseEntity.ok(usersService.updateMyProfile(authentication.getName(), request));
    }

    /**
     * Public: link xác nhận có thể được mở ở trình duyệt chưa đăng nhập.
     * Body: { "token": "..." }
     */
    @PostMapping("/confirm-email-change")
    public ResponseEntity<UserDetailResponse> confirmEmailChange(@Valid @RequestBody ConfirmEmailChangeRequest request) {
        return ResponseEntity.ok(usersService.confirmEmailChange(request.getToken()));
    }

    @PutMapping("/change-password")
    public ResponseEntity<?> changePassword(Authentication authentication,
                                             @Valid @RequestBody ChangePasswordRequest request) {
        usersService.changePassword(authentication.getName(), request);
        return ResponseEntity.ok(
                java.util.Map.of("message", "Password changed successfully")
        );
    }


    // =========================
    // FORGOT PASSWORD
    // =========================

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        usersService.forgotPassword(request);
        return ResponseEntity.ok(
                java.util.Map.of("message", "Reset password email sent")
        );
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        usersService.resetPassword(request);
        return ResponseEntity.ok(
                java.util.Map.of("message", "Password reset successfully")
        );
    }


    // =========================
    // ADMIN – ROLES
    // =========================

    /**
     * GET /api/users/admin/roles
     * Trả về danh sách role từ enum Role.
     */
    @GetMapping("/admin/roles")
    @PreAuthorize("hasRole('SYSTEM_ADMIN') or hasRole('FACILITY_MANAGER') or hasRole('BUSINESS_MANAGER')")
    public ResponseEntity<List<String>> getRoles() {
        List<String> roles = Arrays.stream(Role.values())
                .map(Enum::name)
                .toList();
        return ResponseEntity.ok(roles);
    }


    // =========================
    // ADMIN – USER MANAGEMENT
    // =========================

    /**
     * GET /api/users/admin/users
     */
    @GetMapping("/admin/users")
    @PreAuthorize("hasRole('SYSTEM_ADMIN') or hasRole('FACILITY_MANAGER') or hasRole('BUSINESS_MANAGER')")
    public ResponseEntity<List<UserDetailResponse>> listUsers() {
        return ResponseEntity.ok(usersService.listAllUsers());
    }

    /**
     * POST /api/users/admin/users
     */
    @PostMapping("/admin/users")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<UserDetailResponse> createUser(@Valid @RequestBody AdminCreateUserRequest request) {
        return ResponseEntity.ok(usersService.createUser(request));
    }

    /**
     * PUT /api/users/admin/users/{id}
     */
    @PutMapping("/admin/users/{id}")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<UserDetailResponse> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody AdminUpdateUserRequest request
    ) {
        return ResponseEntity.ok(usersService.updateUser(id, request));
    }

    /**
     * GET /api/users/admin/users/{id}
     */
    @GetMapping("/admin/users/{id}")
    @PreAuthorize("hasRole('SYSTEM_ADMIN') or hasRole('FACILITY_MANAGER') or hasRole('BUSINESS_MANAGER')")
    public ResponseEntity<UserDetailResponse> getUserById(@PathVariable Long id) {
        return ResponseEntity.ok(usersService.getUserById(id));
    }

    /**
     * PUT /api/users/admin/users/{id}/role
     * Body: { "role": "FACILITY_STAFF" }
     */
    @PutMapping("/admin/users/{id}/role")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<UserDetailResponse> updateRole(
            @PathVariable Long id,
            @Valid @RequestBody UpdateRoleRequest request
    ) {
        return ResponseEntity.ok(usersService.updateRole(id, request.getRole()));
    }

    /**
     * PUT /api/users/admin/users/{id}/status
     * Body: { "status": "INACTIVE" }
     */
    @PutMapping("/admin/users/{id}/status")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<UserDetailResponse> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateStatusRequest request
    ) {
        return ResponseEntity.ok(usersService.updateStatus(id, request.getStatus()));
    }

    /**
     * DELETE /api/users/admin/users/{id}
     * Soft-delete: chuyển status → INACTIVE.
     */
    @DeleteMapping("/admin/users/{id}")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<UserDetailResponse> deleteUser(@PathVariable Long id) {
        return ResponseEntity.ok(usersService.deleteUser(id));
    }
}