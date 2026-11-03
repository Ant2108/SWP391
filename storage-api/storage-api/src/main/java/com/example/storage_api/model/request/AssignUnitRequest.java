package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AssignUnitRequest {
    @NotNull
    private Integer storageUnitId;
}
