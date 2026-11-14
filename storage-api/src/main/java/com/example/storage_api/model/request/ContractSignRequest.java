package com.example.storage_api.model.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ContractSignRequest {
    @Size(max = 150, message = "Tên người ký tối đa 150 ký tự")
    private String signerName;

    private String signatureUrl;
}
