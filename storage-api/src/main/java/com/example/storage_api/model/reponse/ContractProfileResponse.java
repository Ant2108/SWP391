package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.ProfileStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContractProfileResponse {
    private Integer id;
    private Integer reservationId;
    private Long customerId;
    private String customerName;
    private String facilityName;
    private String unitTypeName;
    private ProfileStatus status;
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
    private boolean hasIdFront;
    private boolean hasIdBack;
    private LocalDateTime submittedAt;
    private String filledByStaffName;
    private LocalDateTime reviewedAt;
    private String reviewedByName;
    private List<String> rejectReasonCodes;
    private String rejectNote;
    private int rejectCount;
    private boolean signAtCounterRequired;
    private LocalDateTime preSignedAt;
    private String preSignerName;
    private String preSignatureUrl;
    private String preScanUrl;
    private String preScanStatus;
    private String preScanUploader;
    private String preScanNote;
    /** Đã có hợp đồng cho đơn này (chữ ký trước / ảnh ký tại chỗ không còn áp dụng ở bước này). */
    private boolean hasContract;
}
