package com.example.storage_api.model.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class ContractProfileRejectRequest {
    // Mã lý do chọn nhanh: ID_BLURRY, ID_MISMATCH, INFO_MISMATCH, SIGNATURE_INVALID, ADDRESS_UNCLEAR, OTHER
    private List<String> reasonCodes;
    @Size(max = 500) private String note;
}
