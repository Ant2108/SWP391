package com.example.storage_api.security;

import com.example.storage_api.entity.RefreshToken;
import com.example.storage_api.entity.Users;
import com.example.storage_api.model.reponse.LoginResponse;
import com.example.storage_api.service.RefreshTokenService;
import com.example.storage_api.service.UsersService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
public class GoogleOAuth2SuccessHandler
        implements AuthenticationSuccessHandler {

    private final UsersService usersService;

    private final RefreshTokenService refreshTokenService;

    private final JwtService jwtService;

    // Địa chỉ trang web (FE), cấu hình bằng FRONTEND_URL; mặc định http://localhost:5173
    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        OidcUser googleUser =
                (OidcUser) authentication.getPrincipal();

        String email =
                googleUser.getEmail();

        String fullname =
                googleUser.getFullName();

        Users user =
                usersService.findOrCreateGoogleUser(
                        email,
                        fullname
                );

        if (user.getStatus() == null ||
                !user.getStatus().name().equals("ACTIVE")) {

            response.sendRedirect(
                    frontendUrl + "/login?error="
                            + URLEncoder.encode("Tài khoản đã bị khóa hoặc ngừng hoạt động", StandardCharsets.UTF_8)
            );

            return;
        }

        UserDetails userDetails =
                usersService.loadUserByUsername(user.getEmail());

        String accessToken =
                jwtService.generateToken(userDetails);

        RefreshToken refreshToken =
                refreshTokenService
                        .createRefreshToken(user);

        LoginResponse loginResponse =
                LoginResponse.builder()
                        .accessToken(accessToken)
                        .refreshToken(
                                refreshToken.getToken()
                        )
                        .tokenType("Bearer")
                        .userId(user.getId())
                        .email(user.getEmail())
                        .role(user.getRole().name())
                        .build();

        // Trình duyệt đang ở trang Google/Backend, nên không thể đọc JSON: chuyển về trang web (FE)
        // và đặt phiên đăng nhập sau dấu # (fragment không được gửi lên server hay ghi vào log).
        // FE (/oauth2/callback) đọc fragment, lưu đăng nhập rồi điều hướng theo vai trò.
        response.sendRedirect(
                frontendUrl + "/oauth2/callback#" + toFragment(loginResponse)
        );
    }

    private static String toFragment(LoginResponse r) {
        return "accessToken=" + enc(r.getAccessToken())
                + "&refreshToken=" + enc(r.getRefreshToken())
                + "&userId=" + enc(String.valueOf(r.getUserId()))
                + "&email=" + enc(r.getEmail())
                + "&role=" + enc(r.getRole());
    }

    private static String enc(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}