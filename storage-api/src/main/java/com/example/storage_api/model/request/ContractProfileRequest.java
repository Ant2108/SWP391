package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class ContractProfileRequest {
    @NotBlank @Size(max = 150) private String fullName;
    @NotNull private LocalDate dateOfBirth;
    @NotBlank @Size(max = 20) private String gender;
    @Size(max = 60) private String nationality;
    @NotBlank @Size(max = 20) private String nationalId;
    @NotNull private LocalDate idIssueDate;
    @NotBlank @Size(max = 150) private String idIssuePlace;
    @NotBlank @Size(max = 300) private String permanentAddress;
    @Size(max = 300) private String contactAddress;
    @NotBlank @Size(max = 20) private String phone;
    @NotBlank @Size(max = 150) private String email;
    @Size(max = 150) private String occupation;
    @NotBlank @Size(max = 500) private String goodsDescription;
    @NotBlank @Size(max = 150) private String emergencyName;
    @NotBlank @Size(max = 20) private String emergencyPhone;
    // Khách tích xác nhận đã đọc và đồng ý cam kết về tính trung thực của thông tin.
    @NotNull private Boolean agreedTruthful;
}
