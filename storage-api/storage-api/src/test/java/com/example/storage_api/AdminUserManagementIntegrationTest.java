package com.example.storage_api;

import com.example.storage_api.entity.EmailChangeToken;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.EmailChangeTokenRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import com.example.storage_api.security.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for Authorization + User Management.
 *
 * Uses H2 in-memory database (test profile) and Spring MVC MockMvc.
 * Each test is @Transactional so changes are rolled back automatically.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class AdminUserManagementIntegrationTest {

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private FilterChainProxy filterChainProxy;

    @Autowired
    private UsersRepository usersRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EmailChangeTokenRepository emailChangeTokenRepository;

    @MockitoBean
    private JavaMailSender mailSender;

    private MockMvc mockMvc;

    private Users adminUser;
    private Users customerUser;
    private String adminToken;
    private String customerToken;
    private final String RAW_PASSWORD = "password123";

    @BeforeEach
    void setup() {
        // Build MockMvc with the full Spring Security filter chain
        mockMvc = MockMvcBuilders
                .webAppContextSetup(webApplicationContext)
                .addFilters(filterChainProxy)
                .build();

        when(mailSender.createMimeMessage()).thenReturn(new MimeMessage((Session) null));

        usersRepository.deleteAll();

        adminUser = new Users();
        adminUser.setFullname("System Admin");
        adminUser.setEmail("admin@test.com");
        adminUser.setPhone("0123456789");
        adminUser.setPassword(passwordEncoder.encode(RAW_PASSWORD));
        adminUser.setRole(Role.SYSTEM_ADMIN);
        adminUser.setStatus(Status.ACTIVE);
        adminUser = usersRepository.save(adminUser);

        customerUser = new Users();
        customerUser.setFullname("Customer User");
        customerUser.setEmail("customer@test.com");
        customerUser.setPhone("0987654321");
        customerUser.setPassword(passwordEncoder.encode(RAW_PASSWORD));
        customerUser.setRole(Role.CUSTOMER);
        customerUser.setStatus(Status.ACTIVE);
        customerUser = usersRepository.save(customerUser);

        adminToken    = generateToken(adminUser);
        customerToken = generateToken(customerUser);
    }

    // -------------------------------------------------------
    // Helper
    // -------------------------------------------------------

    private String generateToken(Users user) {
        UserDetails userDetails = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPassword())
                .roles(user.getRole().name())
                .build();
        return jwtService.generateToken(userDetails);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private String json(Object obj) throws Exception {
        return objectMapper.writeValueAsString(obj);
    }

    private MimeMessage captureSentMail() {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        return captor.getValue();
    }

    private String mailHtml(MimeMessage message) throws Exception {
        message.saveChanges();
        return (String) message.getContent();
    }

    // -------------------------------------------------------
    // 0. My profile (/api/auth/me) – mọi role đều xem/sửa được
    // -------------------------------------------------------

    @Test
    @DisplayName("GET /me returns profile DTO without password hash")
    void me_returnsProfileWithoutPassword() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(customerUser.getId()))
                .andExpect(jsonPath("$.fullname").value("Customer User"))
                .andExpect(jsonPath("$.phone").value("0987654321"))
                .andExpect(jsonPath("$.role").value("CUSTOMER"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.facility").doesNotExist());
    }

    @Test
    @DisplayName("PUT /me updates profile; no new token when email unchanged")
    void updateMe_sameEmail() throws Exception {
        Map<String, String> body = Map.of(
                "fullname", "New Name",
                "email", "customer@test.com",
                "phone", "0911111111");

        mockMvc.perform(put("/api/auth/me")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullname").value("New Name"))
                .andExpect(jsonPath("$.phone").value("0911111111"))
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test
    @DisplayName("PUT /me with new email does not change it; sends confirmation mail to the current address")
    void updateMe_changeEmail_requiresConfirmation() throws Exception {
        Map<String, String> body = Map.of(
                "fullname", "Customer Renamed",
                "email", "renamed@test.com",
                "phone", "0987654321");

        mockMvc.perform(put("/api/auth/me")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullname").value("Customer Renamed"))
                .andExpect(jsonPath("$.email").value("customer@test.com"))
                .andExpect(jsonPath("$.pendingEmail").value("renamed@test.com"));

        // Email chưa đổi → token cũ vẫn dùng bình thường
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("customer@test.com"));

        MimeMessage sent = captureSentMail();
        assertEquals("customer@test.com", sent.getAllRecipients()[0].toString());
        String html = mailHtml(sent);
        EmailChangeToken token = emailChangeTokenRepository.findAll().get(0);
        assertTrue(html.contains("/confirm-email?token=" + token.getToken()));
        assertTrue(html.contains("renamed@test.com"));
        assertTrue(html.contains("Customer Renamed"));
        assertTrue(html.contains("#F9B800"));
    }

    @Test
    @DisplayName("Confirm email change → email updated, old JWT invalid, link single-use")
    void confirmEmailChange_updatesEmail() throws Exception {
        mockMvc.perform(put("/api/auth/me")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "fullname", "Customer User",
                                "email", "renamed@test.com",
                                "phone", "0987654321"))))
                .andExpect(status().isOk());
        String token = emailChangeTokenRepository.findAll().get(0).getToken();

        mockMvc.perform(post("/api/auth/confirm-email-change")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", token))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("renamed@test.com"));

        // JWT cũ gắn với email cũ → 401 (FE sẽ tự refresh token)
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "renamed@test.com", "password", RAW_PASSWORD))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/confirm-email-change")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", token))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Confirm email change with invalid token → 400")
    void confirmEmailChange_invalidToken() throws Exception {
        mockMvc.perform(post("/api/auth/confirm-email-change")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", "nope"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Forgot password sends branded HTML mail with reset link")
    void forgotPassword_sendsHtmlMail() throws Exception {
        mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "customer@test.com"))))
                .andExpect(status().isOk());

        MimeMessage sent = captureSentMail();
        assertEquals("customer@test.com", sent.getAllRecipients()[0].toString());
        String html = mailHtml(sent);
        assertTrue(html.contains("http://localhost:5173/reset-password?token="));
        assertTrue(html.contains("Customer User"));
        assertTrue(html.contains("15 minutes"));
    }

    @Test
    @DisplayName("PUT /me with another user's email → 409")
    void updateMe_duplicateEmail() throws Exception {
        Map<String, String> body = Map.of(
                "fullname", "Customer User",
                "email", "admin@test.com",
                "phone", "0987654321");

        mockMvc.perform(put("/api/auth/me")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(body)))
                .andExpect(status().isConflict());
    }

    // -------------------------------------------------------
    // 1. CUSTOMER cannot access admin APIs → 403
    // -------------------------------------------------------

    @Test
    @DisplayName("CUSTOMER cannot list users → 403")
    void customer_cannotAccessAdminListUsers() throws Exception {
        mockMvc.perform(get("/api/auth/admin/users")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("CUSTOMER cannot access admin user detail → 403")
    void customer_cannotAccessAdminUserDetail() throws Exception {
        mockMvc.perform(get("/api/auth/admin/users/" + adminUser.getId())
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("CUSTOMER cannot change role → 403")
    void customer_cannotChangeRole() throws Exception {
        mockMvc.perform(put("/api/auth/admin/users/" + customerUser.getId() + "/role")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("role", "SYSTEM_ADMIN"))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Unauthenticated request to admin endpoint → 401")
    void unauthenticated_cannotAccessAdminAPI() throws Exception {
        mockMvc.perform(get("/api/auth/admin/users"))
                .andExpect(status().isUnauthorized());
    }

    // -------------------------------------------------------
    // 2. Authorized admin can list users
    // -------------------------------------------------------

    @Test
    @DisplayName("SYSTEM_ADMIN can list all users")
    void admin_canListUsers() throws Exception {
        mockMvc.perform(get("/api/auth/admin/users")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    // -------------------------------------------------------
    // 3. Admin can view user detail
    // -------------------------------------------------------

    @Test
    @DisplayName("SYSTEM_ADMIN can view user detail by ID")
    void admin_canGetUserById() throws Exception {
        mockMvc.perform(get("/api/auth/admin/users/" + customerUser.getId())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("customer@test.com"))
                .andExpect(jsonPath("$.role").value("CUSTOMER"));
    }

    @Test
    @DisplayName("Invalid user ID → 404 with existing error format")
    void admin_getUserById_notFound() throws Exception {
        mockMvc.perform(get("/api/auth/admin/users/99999")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists())
                .andExpect(jsonPath("$.message").value("User not found"));
    }

    // -------------------------------------------------------
    // 4. Admin can change role
    // -------------------------------------------------------

    @Test
    @DisplayName("SYSTEM_ADMIN can change a user's role")
    void admin_canChangeRole() throws Exception {
        mockMvc.perform(put("/api/auth/admin/users/" + customerUser.getId() + "/role")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("role", "FACILITY_STAFF"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("FACILITY_STAFF"));
    }

    @Test
    @DisplayName("Invalid role value → 400")
    void admin_changeRole_invalidRole() throws Exception {
        mockMvc.perform(put("/api/auth/admin/users/" + customerUser.getId() + "/role")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("role", "SUPER_HERO"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    // -------------------------------------------------------
    // 5. Admin can lock / unlock user
    // -------------------------------------------------------

    @Test
    @DisplayName("SYSTEM_ADMIN can lock a user account")
    void admin_canLockUser() throws Exception {
        mockMvc.perform(put("/api/auth/admin/users/" + customerUser.getId() + "/status")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "INACTIVE"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    @DisplayName("SYSTEM_ADMIN can unlock a user account")
    void admin_canUnlockUser() throws Exception {
        customerUser.setStatus(Status.INACTIVE);
        usersRepository.save(customerUser);

        mockMvc.perform(put("/api/auth/admin/users/" + customerUser.getId() + "/status")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "ACTIVE"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    @DisplayName("Invalid status value → 400")
    void admin_updateStatus_invalidStatus() throws Exception {
        mockMvc.perform(put("/api/auth/admin/users/" + customerUser.getId() + "/status")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "BANNED"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    // -------------------------------------------------------
    // 6. Locked user cannot login; unlocked user can login again
    // -------------------------------------------------------

    @Test
    @DisplayName("Locked (INACTIVE) user cannot login")
    void lockedUser_cannotLogin() throws Exception {
        customerUser.setStatus(Status.INACTIVE);
        usersRepository.save(customerUser);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "email", "customer@test.com",
                                "password", RAW_PASSWORD
                        ))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Account is inactive"));
    }

    @Test
    @DisplayName("Locked user's existing access token is rejected → 401")
    void lockedUser_existingTokenRejected() throws Exception {
        customerUser.setStatus(Status.INACTIVE);
        usersRepository.save(customerUser);

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Locked user cannot refresh access token → 403")
    void lockedUser_cannotRefresh() throws Exception {
        String res = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "email", "customer@test.com",
                                "password", RAW_PASSWORD
                        ))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String refreshToken = objectMapper.readTree(res).get("refreshToken").asText();

        customerUser.setStatus(Status.INACTIVE);
        usersRepository.save(customerUser);

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Account is inactive"));
    }

    @Test
    @DisplayName("Unknown refresh token → 401")
    void refresh_unknownToken() throws Exception {
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", "does-not-exist"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Active user can login successfully")
    void activeUser_canLogin() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "email", "customer@test.com",
                                "password", RAW_PASSWORD
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists());
    }

    // -------------------------------------------------------
    // 7. Admin can delete user
    // -------------------------------------------------------

    @Test
    @DisplayName("SYSTEM_ADMIN soft-deletes user → status becomes INACTIVE")
    void admin_canDeleteUser() throws Exception {
        mockMvc.perform(delete("/api/auth/admin/users/" + customerUser.getId())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    @DisplayName("Delete non-existent user → 404")
    void admin_deleteUser_notFound() throws Exception {
        mockMvc.perform(delete("/api/auth/admin/users/99999")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------
    // 8. GET /api/admin/roles
    // -------------------------------------------------------

    @Test
    @DisplayName("SYSTEM_ADMIN can list all roles")
    void admin_canListRoles() throws Exception {
        mockMvc.perform(get("/api/auth/admin/roles")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0]").exists());
    }
}
