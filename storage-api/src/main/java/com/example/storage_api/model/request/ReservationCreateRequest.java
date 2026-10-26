package com.example.storage_api.model.request;

import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class ReservationCreateRequest {
    @NotNull private Long facilityId;
    @NotNull private Integer unitTypeId;
    @NotNull @FutureOrPresent private LocalDate startDate;
    @NotNull @Min(1) private Integer rentalMonths;
}
