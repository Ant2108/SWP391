package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDateTime;

/**
 * Câu hỏi gửi cho một cơ sở từ trang Support, dùng được cả khi chưa có tài khoản.
 * Khác SupportRequest (chỉ khách đang thuê, gắn với hợp đồng): ở đây chỉ cần tên, email và nội dung.
 * Nhân viên / quản lý cơ sở trả lời, câu trả lời được gửi về email của người hỏi.
 */
@Entity
@Table(name = "Inquiries")
@Getter
@Setter
@NoArgsConstructor
public class Inquiry extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "InquiryId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "FacilityId", nullable = false)
    private Facility facility;

    @Nationalized
    @Column(name = "Name", nullable = false, length = 150)
    private String name;

    @Column(name = "Email", nullable = false, length = 150)
    private String email;

    @Column(name = "Phone", length = 20)
    private String phone;

    @Nationalized
    @Column(name = "Subject", nullable = false, length = 200)
    private String subject;

    @Nationalized
    @Column(name = "Message", nullable = false, length = 1000)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private InquiryStatus status = InquiryStatus.OPEN;

    @Nationalized
    @Column(name = "Answer", length = 1000)
    private String answer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "AnsweredBy")
    private Users answeredBy;

    @Column(name = "AnsweredAt")
    private LocalDateTime answeredAt;
}
