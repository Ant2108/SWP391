package com.example.storage_api.model.reponse;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Response của PUT /api/auth/me: thông tin user (email vẫn là email cũ)
 * + pendingEmail khi user yêu cầu đổi email và đang chờ xác nhận qua mail.
 */
@Getter
@AllArgsConstructor
public class UpdateProfileResponse {

    @JsonUnwrapped
    private UserDetailResponse profile;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String pendingEmail;
}
