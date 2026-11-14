package com.example.storage_api.service;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.model.reponse.ReportSummaryResponse;
import com.example.storage_api.model.reponse.ReportSummaryResponse.FacilityRow;
import com.example.storage_api.model.reponse.ReportSummaryResponse.Row;
import com.example.storage_api.model.reponse.ReportSummaryResponse.UnitTypeRow;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Báo cáo kinh doanh (CHỈ ĐỌC). Doanh thu = tiền thuê + gia hạn + các loại phí đã thu (PAID) trong khoảng ngày.
 * Tiền cọc không tính vào doanh thu: báo riêng đã thu / đã hoàn / công ty giữ lại.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportService {
    private final PaymentRepository paymentRepository;
    private final RentalContractRepository rentalContractRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final FacilityRepository facilityRepository;

    public ReportSummaryResponse summary(LocalDate from, LocalDate to, Long facilityId) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new BadRequestException("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu");
        }
        List<StorageUnit> units = storageUnitRepository.findAll();
        List<RentalContract> contracts = rentalContractRepository.findAll();
        List<Payment> everyPayment = paymentRepository.findAll();
        List<Payment> waivedInRange = everyPayment.stream()
                .filter(p -> p.getWaivedAt() != null
                        && (from == null || !p.getWaivedAt().toLocalDate().isBefore(from))
                        && (to == null || !p.getWaivedAt().toLocalDate().isAfter(to)))
                .toList();
        List<Payment> payments = everyPayment.stream()
                .filter(p -> p.getPaidAt() != null
                        && (from == null || !p.getPaidAt().toLocalDate().isBefore(from))
                        && (to == null || !p.getPaidAt().toLocalDate().isAfter(to)))
                .toList();

        List<Facility> facilities = facilityRepository.findAll().stream()
                .filter(f -> facilityId == null || Objects.equals(f.getId(), facilityId))
                .toList();

        List<FacilityRow> rows = new ArrayList<>();
        for (Facility f : facilities) {
            rows.add(new FacilityRow(f.getId(), f.getName(), f.getStatus().name(), row(f.getId(), units, contracts, payments, waivedInRange)));
        }
        Row totals = row(facilityId, units, contracts, payments, waivedInRange);

        // Theo loại kho: gộp theo TÊN loại kho trên mọi cơ sở (đã lọc theo cơ sở nếu có).
        Map<String, List<StorageUnit>> unitsByType = new LinkedHashMap<>();
        units.stream().filter(u -> facilityId == null || Objects.equals(u.getFacility().getId(), facilityId))
                .forEach(u -> unitsByType.computeIfAbsent(u.getUnitType().getTypeName(), k -> new ArrayList<>()).add(u));
        List<UnitTypeRow> typeRows = new ArrayList<>();
        unitsByType.forEach((name, list) -> {
            int occupied = count(list, UnitStatus.OCCUPIED);
            int reserved = count(list, UnitStatus.RESERVED);
            BigDecimal revenue = payments.stream()
                    .filter(p -> inFacility(p, facilityId) && name.equals(unitTypeNameOf(p)))
                    .filter(ReportService::isRevenue)
                    .map(Payment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            typeRows.add(new UnitTypeRow(name, list.size(), occupied, reserved, count(list, UnitStatus.AVAILABLE),
                    rate(occupied + reserved, list.size()), revenue));
        });
        return new ReportSummaryResponse(from, to, facilityId, totals, rows, typeRows);
    }

    private Row row(Long facilityId, List<StorageUnit> allUnits, List<RentalContract> allContracts, List<Payment> allPayments,
                     List<Payment> allWaived) {
        List<StorageUnit> units = allUnits.stream()
                .filter(u -> facilityId == null || Objects.equals(u.getFacility().getId(), facilityId)).toList();
        List<RentalContract> contracts = allContracts.stream()
                .filter(c -> c.getStorageUnit() != null
                        && (facilityId == null || Objects.equals(c.getStorageUnit().getFacility().getId(), facilityId))).toList();
        List<Payment> payments = allPayments.stream().filter(p -> inFacility(p, facilityId)).toList();

        int occupied = count(units, UnitStatus.OCCUPIED);
        int reserved = count(units, UnitStatus.RESERVED);
        BigDecimal rental = sum(payments, PaymentType.RENTAL, PaymentType.RENEWAL);
        BigDecimal fee = sum(payments, PaymentType.OVERDUE_FEE, PaymentType.EXTRA_FEE, PaymentType.DAMAGE_FEE);

        BigDecimal collected = BigDecimal.ZERO;
        BigDecimal refunded = BigDecimal.ZERO;
        BigDecimal retained = BigDecimal.ZERO;
        for (Payment p : payments) {
            if (p.getPaymentType() != PaymentType.DEPOSIT
                    || (p.getStatus() != PaymentStatus.PAID && p.getStatus() != PaymentStatus.REFUNDED)) {
                continue;
            }
            collected = collected.add(nz(p.getAmount()));
            refunded = refunded.add(nz(p.getRefundAmount()));
            String ref = p.getTransactionReference();
            if (ref != null && ref.startsWith("MAT_COC")) {
                retained = retained.add(nz(p.getAmount()));          // mất toàn bộ cọc
            } else {
                retained = retained.add(nz(p.getDeductionAmount())); // bị khấu trừ một phần
            }
        }
        return new Row(units.size(), count(units, UnitStatus.AVAILABLE), reserved, occupied,
                count(units, UnitStatus.INSPECTION) + count(units, UnitStatus.MAINTENANCE),
                rate(occupied + reserved, units.size()),
                countContracts(contracts, ContractStatus.PENDING), countContracts(contracts, ContractStatus.ACTIVE),
                countContracts(contracts, ContractStatus.OVERDUE), countContracts(contracts, ContractStatus.COMPLETED),
                rental, fee, rental.add(fee), collected, refunded, retained,
                allWaived.stream().filter(p -> inFacility(p, facilityId)).map(p -> nz(p.getAmount()))
                        .reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private static boolean isRevenue(Payment p) {
        return p.getStatus() == PaymentStatus.PAID && switch (p.getPaymentType()) {
            case RENTAL, RENEWAL, OVERDUE_FEE, EXTRA_FEE, DAMAGE_FEE -> true;
            default -> false;
        };
    }

    private static BigDecimal sum(List<Payment> payments, PaymentType... types) {
        List<PaymentType> wanted = List.of(types);
        return payments.stream()
                .filter(p -> p.getStatus() == PaymentStatus.PAID && wanted.contains(p.getPaymentType()))
                .map(p -> nz(p.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static Long facilityIdOf(Payment p) {
        if (p.getRentalContract() != null && p.getRentalContract().getStorageUnit() != null) {
            return p.getRentalContract().getStorageUnit().getFacility().getId();
        }
        return p.getReservation() != null ? p.getReservation().getFacility().getId() : null;
    }

    private static String unitTypeNameOf(Payment p) {
        if (p.getRentalContract() != null && p.getRentalContract().getStorageUnit() != null) {
            return p.getRentalContract().getStorageUnit().getUnitType().getTypeName();
        }
        return p.getReservation() != null ? p.getReservation().getUnitType().getTypeName() : null;
    }

    private static boolean inFacility(Payment p, Long facilityId) {
        return facilityId == null || Objects.equals(facilityIdOf(p), facilityId);
    }

    private static int count(List<StorageUnit> units, UnitStatus s) {
        return (int) units.stream().filter(u -> u.getStatus() == s).count();
    }

    private static int countContracts(List<RentalContract> list, ContractStatus s) {
        return (int) list.stream().filter(c -> c.getStatus() == s).count();
    }

    private static BigDecimal rate(int used, int total) {
        if (total <= 0) {
            return BigDecimal.ZERO.setScale(1);
        }
        return BigDecimal.valueOf(used * 100.0 / total).setScale(1, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
