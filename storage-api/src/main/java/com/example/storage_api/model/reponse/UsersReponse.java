package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import jakarta.validation.constraints.*;

import lombok.*;

import java.util.Date;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder

public class UsersReponse {
    private Long id;
    private String fullname;
    private String email;
    private String phone;
    private Role role;
    private Status status;
    private Date createdAt;
    private Date updatedAt;
}
