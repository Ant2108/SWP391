package com.example.storage_api.model.request;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

/** Bản nháp hồ sơ hợp đồng: mọi trường đều không bắt buộc, dùng để lưu dần những gì khách đã điền. */
@Getter
@Setter
public class ContractProfileDraftRequest {
    private String fullName;
    private LocalDate dateOfBirth;
    private String gender;
    private String nationality;
    private String nationalId;
    private LocalDate idIssueDate;
    private String idIssuePlace;
    private String permanentAddress;
    private String contactAddress;
    private String phone;
    private String email;
    private String occupation;
    private String goodsDescription;
    private String emergencyName;
    private String emergencyPhone;
}
