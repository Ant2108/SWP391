package com.example.storage_api.entity;

public enum Status {
    ACTIVE,
    INACTIVE,;

    public static Status fromString(String value) {
        for (Status status : Status.values()) {
            if (status.name().equalsIgnoreCase(value)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Invalid status: " + value);
    }
}
