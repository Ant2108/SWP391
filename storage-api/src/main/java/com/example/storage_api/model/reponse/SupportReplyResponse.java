package com.example.storage_api.model.reponse;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Một tin nhắn trong Support Request; staffReply = true khi người viết là nhân viên / quản lý. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportReplyResponse {
    private Integer id;
    private Long authorId;
    private String authorName;
    private String authorRole;
    private boolean staffReply;
    private String message;
    private LocalDateTime createdAt;
}
