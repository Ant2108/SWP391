package com.example.storage_api;

import com.example.storage_api.entity.RefreshToken;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.security.GoogleOAuth2SuccessHandler;
import com.example.storage_api.security.JwtService;
import com.example.storage_api.service.RefreshTokenService;
import com.example.storage_api.service.UsersService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Sau khi Google xác nhận, backend phải chuyển trình duyệt về trang web (FE) kèm phiên đăng nhập
 * trong fragment (#...), thay vì in JSON ra màn hình.
 */
class GoogleOAuth2SuccessHandlerTest {

    private static final String FRONTEND = "http://localhost:5173";

    private final UsersService usersService = mock(UsersService.class);
    private final RefreshTokenService refreshTokenService = mock(RefreshTokenService.class);
    private final JwtService jwtService = mock(JwtService.class);

    private GoogleOAuth2SuccessHandler handler() {
        GoogleOAuth2SuccessHandler h = new GoogleOAuth2SuccessHandler(usersService, refreshTokenService, jwtService);
        ReflectionTestUtils.setField(h, "frontendUrl", FRONTEND);
        return h;
    }

    private Authentication googleLogin(String email, String name) {
        OidcUser oidc = mock(OidcUser.class);
        when(oidc.getEmail()).thenReturn(email);
        when(oidc.getFullName()).thenReturn(name);
        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(oidc);
        return auth;
    }

    private Users user(Status status) {
        Users u = new Users();
        u.setId(7L);
        u.setEmail("new.user@gmail.com");
        u.setFullname("New User");
        u.setRole(Role.CUSTOMER);
        u.setStatus(status);
        return u;
    }

    @Test
    void activeUserIsRedirectedToFrontendWithSessionInFragment() throws Exception {
        Users u = user(Status.ACTIVE);
        when(usersService.findOrCreateGoogleUser("new.user@gmail.com", "New User")).thenReturn(u);
        when(usersService.loadUserByUsername("new.user@gmail.com")).thenReturn(mock(UserDetails.class));
        when(jwtService.generateToken(any())).thenReturn("ACCESS.JWT");
        RefreshToken rt = new RefreshToken();
        rt.setToken("REFRESH-123");
        when(refreshTokenService.createRefreshToken(u)).thenReturn(rt);

        MockHttpServletResponse response = new MockHttpServletResponse();
        handler().onAuthenticationSuccess(new MockHttpServletRequest(), response, googleLogin("new.user@gmail.com", "New User"));

        String location = response.getRedirectedUrl();
        assertThat(location).startsWith(FRONTEND + "/oauth2/callback#");
        assertThat(location).contains("accessToken=ACCESS.JWT", "refreshToken=REFRESH-123", "role=CUSTOMER", "userId=7");
        assertThat(location).contains("email=new.user%40gmail.com");
        // Token chỉ nằm trong fragment, không nằm trong query (query sẽ bị ghi vào log server)
        assertThat(location).doesNotContain("?accessToken");
    }

    @Test
    void inactiveUserIsSentBackToLoginWithAnError() throws Exception {
        when(usersService.findOrCreateGoogleUser("new.user@gmail.com", "New User")).thenReturn(user(Status.INACTIVE));

        MockHttpServletResponse response = new MockHttpServletResponse();
        handler().onAuthenticationSuccess(new MockHttpServletRequest(), response, googleLogin("new.user@gmail.com", "New User"));

        assertThat(response.getRedirectedUrl()).startsWith(FRONTEND + "/login?error=");
        assertThat(response.getRedirectedUrl()).doesNotContain("accessToken");
    }
}
