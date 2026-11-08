package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

/** Một tin nhắn trong cuộc trao đổi của một Support Request (khách hoặc nhân viên / quản lý của cơ sở). */
@Entity
@Table(name = "SupportReplies")
@Getter
@Setter
@NoArgsConstructor
public class SupportReply extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SupportReplyId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "SupportRequestId", nullable = false)
    private SupportRequest supportRequest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "AuthorId", nullable = false)
    private Users author;

    @Nationalized
    @Column(name = "Message", nullable = false, length = 1000)
    private String message;
}
