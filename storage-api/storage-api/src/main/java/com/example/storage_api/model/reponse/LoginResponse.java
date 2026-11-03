package com.example.storage_api.model.reponse;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class LoginResponse {

    private String accessToken;

    private String tokenType;

    private String refreshToken;

    private Long userId;

    private String email;

    private String role;
}