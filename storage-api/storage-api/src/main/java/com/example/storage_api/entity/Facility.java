package com.example.storage_api.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.Nationalized;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalTime;

/**
 * Entity Facility = một dòng trong bảng facilities (một cơ sở / chi nhánh kho).
 *
 * Entity là "bản sao bằng Java" của một dòng trong bảng DB. Hibernate dựa vào các annotation
 * bên dưới để biết field Java nào ứng với cột nào, rồi tự sinh câu INSERT / SELECT / UPDATE.
 *
 * Id giữ kiểu Long vì module Users / FacilityAssignment đã dùng entity này (Users.facility,
 * FacilityAuthorizationService), đổi kiểu sẽ làm hỏng module đó.
 */
@Entity // Báo cho JPA: class này map với một bảng
@Table(name = "Facilities") // Tên bảng (Hibernate của project sẽ đổi thành snake_case: facilities)
@Getter // Lombok: tự sinh getter cho mọi field
@Setter // Lombok: tự sinh setter cho mọi field
@NoArgsConstructor // Lombok: constructor rỗng, JPA bắt buộc phải có
public class Facility extends BaseEntity { // extends BaseEntity để có thêm createdAt / updatedAt

    @Id // Khoá chính
    @GeneratedValue(strategy = GenerationType.IDENTITY) // SQL Server tự tăng số (1, 2, 3...), ta không tự đặt
    @Column(name = "FacilityId")
    private Long id;

    // @Nationalized: cột kiểu nvarchar để lưu được tiếng Việt có dấu.
    @Nationalized
    @Column(name = "FacilityName", nullable = false, length = 150) // nullable = false: bắt buộc có tên
    private String name;

    @Nationalized
    @Column(name = "Address", nullable = false, length = 300)
    private String address;

    @Column(name = "Phone", length = 20) // không có nullable = false nên được phép để trống (NULL)
    private String phone;

    // LocalTime = chỉ có giờ:phút (vd 08:00), không có ngày. Map sang kiểu "time" của SQL Server.
    @Column(name = "OpeningTime")
    private LocalTime openingTime;

    @Column(name = "ClosingTime")
    private LocalTime closingTime;

    // Tình trạng hàng do quản lý đặt tay: còn hàng / sắp có / hết hàng.
    @Enumerated(EnumType.STRING)
    @ColumnDefault("'AVAILABLE'")
    @Column(name = "StockStatus", nullable = false, length = 20)
    private StockStatus stockStatus = StockStatus.AVAILABLE;

    // EnumType.STRING: lưu chữ "ACTIVE"/"INACTIVE" vào DB (an toàn hơn lưu số thứ tự 0/1).
    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private FacilityStatus status = FacilityStatus.ACTIVE; // giá trị mặc định khi tạo mới bằng "new Facility()"
}
