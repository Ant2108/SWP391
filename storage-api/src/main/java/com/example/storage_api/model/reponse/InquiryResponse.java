package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.InquiryStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InquiryResponse {
    private Integer id;
    private Long facilityId;
    private String facilityName;
    private String name;
    private String email;
    private String phone;
    private String subject;
    private String message;
    private InquiryStatus status;
    private String answer;
    private String answeredByName;
    private LocalDateTime answeredAt;
    private LocalDateTime createdAt;
}
