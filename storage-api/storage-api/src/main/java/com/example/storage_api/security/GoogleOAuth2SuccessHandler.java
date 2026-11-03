package com.example.storage_api.security;

import com.example.storage_api.entity.RefreshToken;
import com.example.storage_api.entity.Users;
import com.example.storage_api.model.reponse.LoginResponse;
import com.example.storage_api.service.RefreshTokenService;
import com.example.storage_api.service.UsersService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class GoogleOAuth2SuccessHandler
        implements AuthenticationSuccessHandler {

    private final UsersService usersService;

    private final RefreshTokenService refreshTokenService;

    private final JwtService jwtService;

    private final ObjectMapper objectMapper;

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

            response.sendError(
                    HttpServletResponse.SC_FORBIDDEN,
                    "Account is inactive"
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

        response.setContentType(
                "application/json;charset=UTF-8"
        );

        response.getWriter().write(
                objectMapper.writeValueAsString(
                        loginResponse
                )
        );
    }
}