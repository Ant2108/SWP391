package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Hồ sơ thông tin cá nhân của khách để lập hợp đồng thuê kho (mỗi đơn đặt kho một hồ sơ).
 * Gồm thông tin định danh, liên hệ, ảnh CCCD hai mặt (lưu riêng tư) và kết quả kiểm tra của quản lý.
 */
@Entity
@Table(name = "ContractProfiles")
@Getter
@Setter
@NoArgsConstructor
public class ContractProfile extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ContractProfileId")
    private Integer id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ReservationId", nullable = false, unique = true)
    private Reservation reservation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @org.hibernate.annotations.Nationalized
    @Column(name = "FullName", length = 150)
    private String fullName;

    @Column(name = "DateOfBirth")
    private LocalDate dateOfBirth;

    @org.hibernate.annotations.Nationalized
    @Column(name = "Gender", length = 20)
    private String gender;

    @org.hibernate.annotations.Nationalized
    @Column(name = "Nationality", length = 60)
    private String nationality;

    @Column(name = "NationalId", length = 20)
    private String nationalId;

    @Column(name = "IdIssueDate")
    private LocalDate idIssueDate;

    @org.hibernate.annotations.Nationalized
    @Column(name = "IdIssuePlace", length = 150)
    private String idIssuePlace;

    @org.hibernate.annotations.Nationalized
    @Column(name = "PermanentAddress", length = 300)
    private String permanentAddress;

    @org.hibernate.annotations.Nationalized
    @Column(name = "ContactAddress", length = 300)
    private String contactAddress;

    @Column(name = "Phone", length = 20)
    private String phone;

    @Column(name = "Email", length = 150)
    private String email;

    @org.hibernate.annotations.Nationalized
    @Column(name = "Occupation", length = 150)
    private String occupation;

    // Mô tả loại hàng hóa dự kiến lưu kho (để đối chiếu danh mục hàng cấm).
    @org.hibernate.annotations.Nationalized
    @Column(name = "GoodsDescription", length = 500)
    private String goodsDescription;

    @org.hibernate.annotations.Nationalized
    @Column(name = "EmergencyName", length = 150)
    private String emergencyName;

    @Column(name = "EmergencyPhone", length = 20)
    private String emergencyPhone;

    // Tên file ảnh CCCD (lưu ở thư mục riêng tư, không có URL công khai).
    @Column(name = "IdFrontFile", length = 80)
    private String idFrontFile;

    @Column(name = "IdBackFile", length = 80)
    private String idBackFile;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private ProfileStatus status = ProfileStatus.DRAFT;

    @Column(name = "SubmittedAt")
    private LocalDateTime submittedAt;

    // Người điền hộ khách tại quầy (null = khách tự điền).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "FilledByStaffId")
    private Users filledByStaff;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ReviewedById")
    private Users reviewedBy;

    @Column(name = "ReviewedAt")
    private LocalDateTime reviewedAt;

    // Lý do từ chối: các mã chọn nhanh cách nhau bằng dấu phẩy + ghi chú tự do (không bắt buộc).
    @Column(name = "RejectReasonCodes", length = 300)
    private String rejectReasonCodes;

    @org.hibernate.annotations.Nationalized
    @Column(name = "RejectNote", length = 500)
    private String rejectNote;

    // Số lần bị từ chối; từ lần thứ 3 bắt buộc ký trực tiếp tại quầy khi nhận kho.
    @Column(name = "RejectCount", nullable = false)
    private int rejectCount;

    @Column(name = "SignAtCounterRequired", nullable = false)
    private boolean signAtCounterRequired;

    // Chữ ký khách đã ký trước khi quản lý gán ô kho (hợp đồng chưa tồn tại); sẽ chép sang hợp đồng khi tạo.
    @Column(name = "PreSignedAt")
    private LocalDateTime preSignedAt;

    @org.hibernate.annotations.Nationalized
    @Column(name = "PreSignerName", length = 150)
    private String preSignerName;

    @Column(name = "PreSignatureUrl", length = 100000)
    private String preSignatureUrl;

    // Ảnh hợp đồng giấy ký tại chỗ khi hợp đồng chưa được tạo (chờ quản lý duyệt, rồi chép sang hợp đồng).
    @Column(name = "PreScanUrl", length = 500)
    private String preScanUrl;

    /** PENDING_REVIEW | APPROVED | REJECTED */
    @Column(name = "PreScanStatus", length = 20)
    private String preScanStatus;

    @org.hibernate.annotations.Nationalized
    @Column(name = "PreScanUploader", length = 150)
    private String preScanUploader;

    @org.hibernate.annotations.Nationalized
    @Column(name = "PreScanNote", length = 500)
    private String preScanNote;
}
