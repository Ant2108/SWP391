package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserDetailResponse {
    private Long id;
    private String fullname;
    private String email;
    private String phone;
    private Role role;
    private Status status;
}
