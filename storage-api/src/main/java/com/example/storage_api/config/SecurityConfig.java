package com.example.storage_api.config;

import com.example.storage_api.security.GoogleOAuth2SuccessHandler;
import com.example.storage_api.security.JwtAuthenticationFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.config.Customizer;

import java.util.Map;

/**
 * Central Spring Security configuration.
 *
 * Role authorization model:
 *  - Public endpoints: register, login, forgot/reset-password, refresh, logout, oauth2, swagger
 *  - /api/admin/** : SYSTEM_ADMIN only (also guarded by @PreAuthorize in AdminController)
 *  - All other endpoints: any authenticated user
 *
 * Facility-level authorization (FACILITY_STAFF / FACILITY_MANAGER can only access their own
 * facility) is enforced at the method level using @PreAuthorize in each controller
 * (see FacilityAuthorizationService for the helper).
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }

    /**
     * Custom 403 handler that returns the same JSON error format as GlobalExceptionHandler.
     */
    @Bean
    public AccessDeniedHandler accessDeniedHandler(ObjectMapper objectMapper) {
        return (request, response, ex) -> {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            Map<String, String> body = Map.of(
                    "error", "Forbidden",
                    "message", "You do not have permission to access this resource"
            );
            response.getWriter().write(objectMapper.writeValueAsString(body));
        };
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler,
            AccessDeniedHandler accessDeniedHandler
    ) throws Exception {

        http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())

                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.IF_REQUIRED
                        )
                )

                .authorizeHttpRequests(auth -> auth
                        // explicitly permit OPTIONS
                        .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()

                        // Public auth endpoints
                        .requestMatchers(
                                "/api/auth/register",
                                "/api/auth/register/",
                                "/api/auth/login",
                                "/api/auth/login/",
                                "/api/auth/forgot-password",
                                "/api/auth/reset-password",
                                "/api/auth/confirm-email-change",
                                "/api/auth/refresh",
                                "/api/auth/logout"
                        ).permitAll()

                        // OAuth2 / Google login
                        .requestMatchers(
                                "/oauth2/**",
                                "/login/**"
                        ).permitAll()

                        // Swagger / OpenAPI
                        .requestMatchers(
                                "/swagger-ui/**",
                                "/v3/api-docs/**"
                        ).permitAll()

                        // Admin APIs – SYSTEM_ADMIN only
                        .requestMatchers("/api/auth/admin/**", "/api/facility-assignments/**")
                                .hasRole("SYSTEM_ADMIN")

                        // All other requests require authentication
                        .anyRequest().authenticated()
                )

                // Return 401 JSON instead of redirect for unauthenticated API requests
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(
                                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)
                        )
                        .accessDeniedHandler(accessDeniedHandler)
                )

                .addFilterBefore(
                        jwtAuthenticationFilter,
                        UsernamePasswordAuthenticationFilter.class
                )

                .oauth2Login(oauth2 ->
                        oauth2
                                .successHandler(googleOAuth2SuccessHandler)
                                .failureHandler((request, response, exception) -> {

                                    exception.printStackTrace();

                                    response.setContentType(
                                            "text/plain;charset=UTF-8"
                                    );

                                    response.getWriter().write(
                                            "Google OAuth2 login failed:\n"
                                                    + exception.getClass().getName()
                                                    + "\n"
                                                    + exception.getMessage()
                                    );
                                })
                );

        return http.build();
    }
}