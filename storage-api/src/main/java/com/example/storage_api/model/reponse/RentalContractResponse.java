package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.ContractStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RentalContractResponse {
    private Integer id;
    private Integer reservationId;
    private Long customerId;
    private String customerName;
    private Long facilityId;
    private String facilityName;
    private Integer unitTypeId;
    private String unitTypeName;
    private Integer storageUnitId;
    private String unitCode;
    private LocalDate startDate;
    private LocalDate endDate;
    private BigDecimal monthlyPrice;
    private BigDecimal depositAmount;
    private ContractStatus status;
    private Boolean overdue;
    private LocalDateTime signedAt;
    private String signerName;
    private boolean signedAtCounter;
    private String signatureUrl;
    /** Yêu cầu hủy sớm gần nhất của hợp đồng (null nếu chưa có). */
    /** Trạng thái hồ sơ hợp đồng của khách (DRAFT / SUBMITTED / APPROVED / REJECTED), null nếu chưa có hồ sơ. */
    private String profileStatus;
    private Boolean signedBeforeAssign;
    private String unitFloor;
    private String unitLocation;
    private String signedScanUrl;
    private String signedScanStatus;
    private String signedScanUploader;
    private java.time.LocalDateTime signedScanUploadedAt;
    private String signedScanNote;
    private Integer terminationId;
    private String terminationStatus;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
