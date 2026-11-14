package com.example.storage_api.service;

import com.example.storage_api.security.JwtService;
import com.example.storage_api.entity.*;
import com.example.storage_api.exception.AppException;
import com.example.storage_api.model.reponse.LoginResponse;
import com.example.storage_api.model.reponse.UpdateProfileResponse;
import com.example.storage_api.model.reponse.UserDetailResponse;
import com.example.storage_api.model.request.*;
import com.example.storage_api.reponsitory.EmailChangeTokenRepository;
import com.example.storage_api.reponsitory.PasswordResetTokenRepository;
import com.example.storage_api.reponsitory.RefreshTokenRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class UsersService implements UserDetailsService {

    private final RefreshTokenService refreshTokenService;
    private final UsersRepository usersRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final EmailService emailService;
    private final RefreshTokenRepository  refreshTokenRepository;
    private final EmailChangeTokenRepository emailChangeTokenRepository;


    // =========================
    // REGISTER
    // =========================

    public UserDetailResponse register(UsersRequest request) {
        if (usersRepository.existsByEmail(request.getEmail())) {
            throw new AppException(HttpStatus.CONFLICT, "Email này đã được đăng ký");
        }
        Users user = new Users();
        user.setFullname(request.getFullname());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(Role.CUSTOMER);
        user.setStatus(Status.ACTIVE);

        return toUserDetailResponse(usersRepository.save(user));
    }


    // =========================
    // LOGIN
    // =========================

    public LoginResponse login(LoginRequest request) {
        Users user = usersRepository.findByEmail(request.getEmail()).orElseThrow(() ->
                        new AppException(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng"));

        boolean passwordCorrect = passwordEncoder.matches(
                request.getPassword(),
                user.getPassword());

        if (!passwordCorrect) {
            throw new AppException(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng");
        }

        if (user.getStatus() != Status.ACTIVE) {
            throw new AppException(HttpStatus.FORBIDDEN, "Tài khoản đã bị khóa hoặc ngừng hoạt động");
        }

        UserDetails userDetails = loadUserByUsername(user.getEmail());
        String token = jwtService.generateToken(userDetails);
        RefreshToken refreshToken = refreshTokenService.createRefreshToken(user);

        return LoginResponse.builder()
                .accessToken(token)
                .refreshToken(refreshToken.getToken())
                .tokenType("Bearer")
                .userId(user.getId())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    @Transactional
    public void logout(String refreshToken) {
        RefreshToken token = refreshTokenRepository
                .findByToken(refreshToken)
                .orElseThrow(() ->
                        new RuntimeException("Phiên đăng nhập không hợp lệ")
                );

        refreshTokenRepository.delete(token);
    }
    // =========================
    // GET CURRENT USER
    // =========================

    public Users getCurrentUser(String email) {

        return usersRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));
    }


    public UserDetailResponse getMyProfile(String email) {
        return toUserDetailResponse(getCurrentUser(email));
    }


    // =========================
    // CHANGE PASSWORD
    // =========================

    public void changePassword(String email, ChangePasswordRequest request) {
        Users user = usersRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));

        if (!passwordEncoder.matches(request.getOldPassword(), user.getPassword()))
        {
            throw new AppException(HttpStatus.BAD_REQUEST, "Mật khẩu hiện tại không chính xác");
        }

        if (passwordEncoder.matches(request.getNewPassword(), user.getPassword())) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Mật khẩu mới không được trùng với mật khẩu cũ");
        }
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        usersRepository.save(user);
    }

    // =========================
    // UPDATE MY PROFILE
    // =========================

    /**
     * Tên + SĐT cập nhật ngay. Email mới KHÔNG đổi liền: gửi link xác nhận tới
     * email HIỆN TẠI, email chỉ đổi khi chủ tài khoản bấm link (xem confirmEmailChange).
     */
    @Transactional
    public UpdateProfileResponse updateMyProfile(String email, AdminUpdateUserRequest request) {
        Users user = usersRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));

        user.setFullname(request.getFullname());
        user.setPhone(request.getPhone());
        usersRepository.save(user);

        String newEmail = request.getEmail().trim();
        if (newEmail.equalsIgnoreCase(user.getEmail())) {
            return new UpdateProfileResponse(toUserDetailResponse(user), null);
        }

        if (usersRepository.existsByEmail(newEmail)) {
            throw new AppException(HttpStatus.CONFLICT, "Email này đã được đăng ký");
        }

        // Mỗi user chỉ giữ 1 yêu cầu đổi email gần nhất.
        emailChangeTokenRepository.deleteByUser(user);
        emailChangeTokenRepository.flush();

        EmailChangeToken changeToken = new EmailChangeToken();
        changeToken.setToken(UUID.randomUUID().toString());
        changeToken.setUser(user);
        changeToken.setNewEmail(newEmail);
        changeToken.setExpiryDate(LocalDateTime.now().plusMinutes(EmailService.EMAIL_CHANGE_EXPIRY_MINUTES));
        changeToken.setUsed(false);
        emailChangeTokenRepository.save(changeToken);

        try {
            emailService.sendEmailChangeConfirmation(user.getEmail(), user.getFullname(), newEmail, changeToken.getToken());
        } catch (Exception e) {
            System.err.println("Gửi email xác nhận đổi email thất bại (Kiểm tra lại cấu hình SMTP). Token: " + changeToken.getToken());
            System.err.println("Error details: " + e.getMessage());
            throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, "Không gửi được email xác nhận, vui lòng thử lại sau");
        }

        return new UpdateProfileResponse(toUserDetailResponse(user), newEmail);
    }

    @Transactional
    public UserDetailResponse confirmEmailChange(String token) {
        EmailChangeToken changeToken = emailChangeTokenRepository.findByToken(token)
                .orElseThrow(() -> new AppException(HttpStatus.BAD_REQUEST, "Liên kết xác nhận không hợp lệ"));

        if (changeToken.isUsed()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Liên kết xác nhận đã được sử dụng");
        }
        if (changeToken.getExpiryDate().isBefore(LocalDateTime.now())) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Liên kết xác nhận đã hết hạn");
        }
        // Email có thể đã bị tài khoản khác dùng trong lúc chờ xác nhận.
        if (usersRepository.existsByEmail(changeToken.getNewEmail())) {
            throw new AppException(HttpStatus.CONFLICT, "Email này đã được đăng ký");
        }

        Users user = changeToken.getUser();
        user.setEmail(changeToken.getNewEmail());
        changeToken.setUsed(true);
        emailChangeTokenRepository.save(changeToken);
        return toUserDetailResponse(usersRepository.save(user));
    }


    // =========================
    // LOAD USER
    // =========================

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        Users user = usersRepository.findByEmail(email).orElseThrow(() ->
                        new UsernameNotFoundException("Không tìm thấy người dùng"));

        return User.builder()
                .username(user.getEmail())
                .password(user.getPassword())
                .roles(user.getRole().name())
                .disabled(user.getStatus() != Status.ACTIVE)
                .build();
    }


    // =========================
    // FORGOT PASSWORD
    // =========================

    public void forgotPassword(ForgotPasswordRequest request) {

        Users user = usersRepository.findByEmail(request.getEmail()).orElseThrow(() ->
                        new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy email này"));

        // Xóa token cũ nếu user đã từng request và đẩy (flush) lệnh delete xuống DB ngay lập tức
        // để tránh lỗi Unique Constraint khi Hibernate cố insert token mới trước khi delete token cũ.
        passwordResetTokenRepository.deleteByUser(user);
        passwordResetTokenRepository.flush();

        // Tạo token mới
        String token = UUID.randomUUID().toString();

        PasswordResetToken resetToken = new PasswordResetToken();

        resetToken.setToken(token);
        resetToken.setUser(user);
        resetToken.setExpiryDate(LocalDateTime.now().plusMinutes(EmailService.RESET_PASSWORD_EXPIRY_MINUTES));
        resetToken.setUsed(false);

        passwordResetTokenRepository.save(resetToken);

        // Gửi email
        try {
            emailService.sendResetPasswordEmail(user.getEmail(), user.getFullname(), token);
        } catch (Exception e) {
            // For local development, if SMTP is not configured, print the link so they can test
            System.err.println("Gửi email thất bại (Kiểm tra lại cấu hình SMTP). Link reset mật khẩu:");
            System.err.println("Reset token: " + token);
            System.err.println("Error details: " + e.getMessage());
            
            throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, "Lỗi gửi email: Vui lòng cấu hình SMTP hoặc xem link ở console backend.");
        }
    }


    // =========================
    // RESET PASSWORD
    // =========================

    public void resetPassword(ResetPasswordRequest request) {

        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(request.getToken())
                        .orElseThrow(() ->
                                new AppException(HttpStatus.BAD_REQUEST, "Liên kết đặt lại mật khẩu không hợp lệ"));

        if (resetToken.isUsed()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Liên kết đặt lại mật khẩu đã được sử dụng");
        }

        if (resetToken.getExpiryDate().isBefore(LocalDateTime.now())) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Liên kết đặt lại mật khẩu đã hết hạn");
        }

        Users user = resetToken.getUser();

        if (passwordEncoder.matches(request.getNewPassword(), user.getPassword())) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Mật khẩu mới phải khác mật khẩu cũ");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));

        usersRepository.save(user);

        resetToken.setUsed(true);
        passwordResetTokenRepository.save(resetToken);
    }

    public Users findOrCreateGoogleUser(String email, String fullname) {

        Users user = usersRepository.findByEmail(email).orElse(null);

        if (user != null) {
            return user;
        }

        Users newUser = new Users();

        newUser.setEmail(email);
        newUser.setFullname(fullname != null && !fullname.isBlank()
                        ? fullname
                        : email
        );

        /*
         * Google user không login bằng password.
         * Nhưng entity hiện tại đang yêu cầu password.
         * Vì vậy tạo một password ngẫu nhiên.
         */
        newUser.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));

        newUser.setRole(Role.CUSTOMER);
        newUser.setStatus(Status.ACTIVE);

        return usersRepository.save(newUser);
    }


    // =========================
    // ADMIN USER MANAGEMENT
    // =========================

    public List<UserDetailResponse> listAllUsers() {
        return usersRepository.findAll()
                .stream()
                .map(this::toUserDetailResponse)
                .toList();
    }

    @Transactional
    public UserDetailResponse createUser(AdminCreateUserRequest request) {
        if (usersRepository.existsByEmail(request.getEmail())) {
            throw new AppException(HttpStatus.CONFLICT, "Email này đã được đăng ký");
        }
        Role role;
        try {
            role = Role.fromString(request.getRole());
        } catch (IllegalArgumentException e) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Vai trò không hợp lệ: " + request.getRole());
        }

        Users user = new Users();
        user.setFullname(request.getFullname());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(role);
        user.setStatus(Status.ACTIVE); // Default status

        return toUserDetailResponse(usersRepository.save(user));
    }

    @Transactional
    public UserDetailResponse updateUser(Long id, AdminUpdateUserRequest request) {
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));

        if (!user.getEmail().equals(request.getEmail()) && usersRepository.existsByEmail(request.getEmail())) {
            throw new AppException(HttpStatus.CONFLICT, "Email này đã được đăng ký");
        }

        user.setFullname(request.getFullname());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());

        return toUserDetailResponse(usersRepository.save(user));
    }

    public UserDetailResponse getUserById(Long id) {
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));
        return toUserDetailResponse(user);
    }

    @Transactional
    public UserDetailResponse updateRole(Long id, String roleStr) {
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));
        Role role;
        try {
            role = Role.fromString(roleStr);
        } catch (IllegalArgumentException e) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Vai trò không hợp lệ: " + roleStr);
        }
        // Không hạ quyền tài khoản System Admin (kể cả tự hạ quyền mình); giữ nguyên role thì không sao.
        if (user.getRole() == Role.SYSTEM_ADMIN && role != Role.SYSTEM_ADMIN) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Không thể đổi vai trò của tài khoản quản trị hệ thống");
        }
        user.setRole(role);
        return toUserDetailResponse(usersRepository.save(user));
    }

    @Transactional
    public UserDetailResponse updateStatus(Long id, String statusStr) {
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));
        Status status;
        try {
            status = Status.fromString(statusStr);
        } catch (IllegalArgumentException e) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Trạng thái không hợp lệ: " + statusStr);
        }
        if (status != Status.ACTIVE) {
            assertNotSystemAdmin(user);
        }
        user.setStatus(status);
        if (status == Status.ACTIVE) {
            // Admin mở khóa: xóa chuỗi vi phạm và thời hạn khóa tạm.
            user.setUnpaidStreak(0);
            user.setLockedUntil(null);
        }
        return toUserDetailResponse(usersRepository.save(user));
    }

    @Transactional
    public UserDetailResponse deleteUser(Long id) {
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));
        assertNotSystemAdmin(user);
        user.setStatus(Status.INACTIVE);
        return toUserDetailResponse(usersRepository.save(user));
    }

    // Tài khoản System Admin không được xóa / vô hiệu hóa: nếu mất hết admin thì không ai quản lý hệ thống được nữa.
    private void assertNotSystemAdmin(Users user) {
        if (user.getRole() == Role.SYSTEM_ADMIN) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Không thể xóa hoặc vô hiệu hóa tài khoản quản trị hệ thống");
        }
    }

    private UserDetailResponse toUserDetailResponse(Users user) {
        return UserDetailResponse.builder()
                .id(user.getId())
                .fullname(user.getFullname())
                .email(user.getEmail())
                .phone(user.getPhone())
                .role(user.getRole())
                .status(user.getStatus())
                .facilityId(user.getFacility() != null ? user.getFacility().getId() : null)
                .facilityName(user.getFacility() != null ? user.getFacility().getName() : null)
                .build();
    }
}