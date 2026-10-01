package com.example.storage_api.security;

import com.example.storage_api.service.UsersService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter
        extends OncePerRequestFilter {

    private final JwtService jwtService;

    private final UsersService usersService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String authHeader =
                request.getHeader("Authorization");

        // Không có Authorization header
        if (authHeader == null ||
                !authHeader.startsWith("Bearer ")) {

            filterChain.doFilter(request, response);
            return;
        }

        // Cắt "Bearer "
        String token =
                authHeader.substring(7);

        try {

            // Lấy email từ JWT
            String email =
                    jwtService.extractUsername(token);

            if (email != null) {

                UserDetails userDetails =
                        usersService
                                .loadUserByUsername(email);

                // Kiểm tra JWT (user bị khóa → token cũ không còn dùng được)
                if (userDetails.isEnabled() && jwtService.isTokenValid(
                        token,
                        userDetails
                )) {

                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(
                                    userDetails,
                                    null,
                                    userDetails.getAuthorities()
                            );

                    authentication.setDetails(
                            new WebAuthenticationDetailsSource()
                                    .buildDetails(request)
                    );

                    // LUÔN LUÔN ghi đè Authentication bằng JWT, bỏ qua JSESSIONID
                    SecurityContextHolder
                            .getContext()
                            .setAuthentication(
                                    authentication
                            );
                } else {
                    // Nếu có token nhưng không hợp lệ, xóa luôn context (bỏ qua session)
                    SecurityContextHolder.clearContext();
                }
            }

        } catch (Exception e) {

            // JWT invalid hoặc expired
            // Xóa context để không bị dùng nhầm session cũ
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }
}