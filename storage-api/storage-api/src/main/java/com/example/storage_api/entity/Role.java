package com.example.storage_api.entity;


public enum Role {
    CUSTOMER,
    FACILITY_STAFF,
    FACILITY_MANAGER,
    BUSINESS_MANAGER,
    SYSTEM_ADMIN;

    public static Role fromString(String value) {
        for (Role role : Role.values()) {
            if (role.name().equalsIgnoreCase(value)) {
                return role;
            }
        }
        throw new IllegalArgumentException("Invalid role: " + value);
    }
}

