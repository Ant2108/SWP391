package com.example.storage_api.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Lưu tập loại kho của Facility trong MỘT cột chuỗi, vd "STANDARD,COLD".
 * (Chỉ có 2 giá trị nên không cần bảng riêng.) Giá trị lạ trong DB bị bỏ qua thay vì làm lỗi cả danh sách.
 */
@Converter
public class StorageCategorySetConverter implements AttributeConverter<Set<StorageCategory>, String> {

    @Override
    public String convertToDatabaseColumn(Set<StorageCategory> attribute) {
        if (attribute == null || attribute.isEmpty()) return StorageCategory.STANDARD.name();
        return attribute.stream().sorted().map(Enum::name).collect(Collectors.joining(","));
    }

    @Override
    public Set<StorageCategory> convertToEntityAttribute(String dbData) {
        Set<StorageCategory> result = EnumSet.noneOf(StorageCategory.class);
        if (dbData == null || dbData.isBlank()) return EnumSet.of(StorageCategory.STANDARD);
        Arrays.stream(dbData.split(",")).map(String::trim).forEach(v -> {
            try { result.add(StorageCategory.valueOf(v)); } catch (IllegalArgumentException ignored) { /* bỏ giá trị lạ */ }
        });
        return result.isEmpty() ? EnumSet.of(StorageCategory.STANDARD) : result;
    }
}
