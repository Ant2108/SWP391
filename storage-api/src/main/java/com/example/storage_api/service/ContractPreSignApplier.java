package com.example.storage_api.service;

import com.example.storage_api.entity.ContractProfile;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.reponsitory.ContractProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Khách có thể ký điện tử trước khi quản lý gán ô kho (lúc đó chưa có hợp đồng).
 * Khi hợp đồng được tạo, chữ ký đã lưu trên hồ sơ được chép sang hợp đồng.
 */
@Component
@RequiredArgsConstructor
public class ContractPreSignApplier {

    private final ContractProfileRepository profileRepository;

    /** Gọi trước khi lưu hợp đồng mới. Không làm gì nếu khách chưa ký trước. */
    public void apply(RentalContract contract) {
        if (contract.getReservation() == null || contract.getSignedAt() != null) return;
        ContractProfile p = profileRepository.findByReservation_Id(contract.getReservation().getId()).orElse(null);
        if (p == null) return;
        // Ảnh hợp đồng giấy đã được quản lý duyệt trước khi hợp đồng được tạo.
        if ("APPROVED".equals(p.getPreScanStatus()) && p.getPreScanUrl() != null) {
            contract.setSignedAt(LocalDateTime.now());
            contract.setSignerName(contract.getCustomer().getFullname());
            contract.setSignedAtCounter(true);
            contract.setSignedScanUrl(p.getPreScanUrl());
            contract.setSignedScanStatus("APPROVED");
            contract.setSignedScanUploader(p.getPreScanUploader());
            contract.setSignedScanUploadedAt(LocalDateTime.now());
            contract.setSignedBeforeAssign(true);
            return;
        }
        if (p.getPreSignedAt() == null || p.getPreSignatureUrl() == null) return;
        contract.setSignedBeforeAssign(true);
        contract.setSignedAt(p.getPreSignedAt() != null ? p.getPreSignedAt() : LocalDateTime.now());
        contract.setSignerName(p.getPreSignerName());
        contract.setSignatureUrl(p.getPreSignatureUrl());
        contract.setSignedAtCounter(false);
    }
}
