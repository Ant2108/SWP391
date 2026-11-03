package com.example.storage_api.entity;

/**
 * Trạng thái của một ô kho (cột Status trong bảng storage_units).
 *
 * Đổi trạng thái THỦ CÔNG (PATCH /api/storage-units/{id}/status) chỉ theo các bước hợp lệ dưới đây.
 * Các luồng tự động (đặt chỗ, ký hợp trả, trả kho) tự đặt trạng thái và không đi qua luật này.
 *
 *   AVAILABLE   -> INSPECTION, MAINTENANCE
 *   RESERVED    -> AVAILABLE (nhả chỗ)
 *   OCCUPIED    -> INSPECTION, MAINTENANCE   (KHÔNG về thẳng AVAILABLE: phải qua kiểm tra / trả kho)
 *   INSPECTION  -> AVAILABLE, MAINTENANCE
 *   MAINTENANCE -> AVAILABLE, INSPECTION
 *
 * AVAILABLE -> RESERVED/OCCUPIED bị chặn vì hai trạng thái đó chỉ sinh ra từ đặt chỗ / hợp đồng thật.
 */
public enum UnitStatus {
    // Còn trống, có thể cho thuê.
    AVAILABLE,
    // Đã được giữ chỗ.
    RESERVED,
    // Đang có khách thuê.
    OCCUPIED,
    // Đang kiểm tra.
    INSPECTION,
    // Đang bảo trì.
    MAINTENANCE;

    /** Các trạng thái được phép chuyển tới thủ công từ trạng thái này. */
    public java.util.Set<UnitStatus> allowedNext() {
        return switch (this) {
            case AVAILABLE -> java.util.EnumSet.of(INSPECTION, MAINTENANCE);
            case RESERVED -> java.util.EnumSet.of(AVAILABLE);
            case OCCUPIED -> java.util.EnumSet.of(INSPECTION, MAINTENANCE);
            case INSPECTION -> java.util.EnumSet.of(AVAILABLE, MAINTENANCE);
            case MAINTENANCE -> java.util.EnumSet.of(AVAILABLE, INSPECTION);
        };
    }

    public boolean canChangeTo(UnitStatus next) {
        return allowedNext().contains(next);
    }
}
