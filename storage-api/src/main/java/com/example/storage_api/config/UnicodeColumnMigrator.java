package com.example.storage_api.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Sửa lỗi mất dấu tiếng Việt (chữ ữ, ệ, ì, ụ... biến thành dấu "?"): các cột chữ tạo lúc đầu là VARCHAR nên SQL Server
 * không lưu được mọi ký tự tiếng Việt. Hibernate (ddl-auto: update) không tự đổi kiểu cột đã có, nên mỗi lần khởi động
 * ta kiểm tra và đổi các cột này sang NVARCHAR. Chạy lại nhiều lần vẫn an toàn (cột đã là NVARCHAR thì bỏ qua).
 * Dữ liệu đã bị thay bằng "?" từ trước không khôi phục được; khách cần nhập lại.
 */
@Slf4j
@Profile("!test")
@Component
@RequiredArgsConstructor
public class UnicodeColumnMigrator {
    private static final Map<String, List<String>> COLUMNS = Map.of(
            "ContractProfiles", List.of("FullName", "Gender", "Nationality", "IdIssuePlace", "PermanentAddress",
                    "ContactAddress", "Occupation", "GoodsDescription", "EmergencyName", "RejectNote"),
            "Payments", List.of("DeductionLines"),
            "UnitReturns", List.of("DamageFeeBreakdown"));

    private final JdbcTemplate jdbc;

    @Order(1)
    @EventListener(ApplicationReadyEvent.class)
    public void migrate() {
        COLUMNS.forEach((tableName, columns) -> columns.forEach(columnName -> {
            String table = snake(tableName);
            String column = snake(columnName);
            try {
                List<Map<String, Object>> info = jdbc.queryForList(
                        "SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS "
                                + "WHERE TABLE_NAME = ? AND COLUMN_NAME = ?", table, column);
                if (info.isEmpty()) {
                    return;
                }
                Map<String, Object> row = info.get(0);
                if (!"varchar".equalsIgnoreCase(String.valueOf(row.get("DATA_TYPE")))) {
                    return;
                }
                Object len = row.get("CHARACTER_MAXIMUM_LENGTH");
                int length = len == null ? -1 : ((Number) len).intValue();
                String size = length <= 0 || length > 4000 ? "MAX" : String.valueOf(length);
                String nullable = "YES".equalsIgnoreCase(String.valueOf(row.get("IS_NULLABLE"))) ? "NULL" : "NOT NULL";
                jdbc.execute("ALTER TABLE " + table + " ALTER COLUMN " + column + " NVARCHAR(" + size + ") " + nullable);
                log.info("Converted {}.{} to NVARCHAR({})", table, column, size);
            } catch (RuntimeException e) {
                log.warn("Could not convert {}.{} to NVARCHAR: {}", table, column, e.getMessage());
            }
        }));
    }

    /** Tên bảng / cột trong CSDL là snake_case (ContractProfiles -> contract_profiles, FullName -> full_name). */
    private static String snake(String name) {
        return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase();
    }
}
