import React from 'react'
import { Boxes, Loader2 } from 'lucide-react'

export default function Warehouse3DLoading() {
  return (
    <div className="warehouse-3d-wrapper warehouse-3d-loading-state">
      <div className="loading-3d-inner">
        <div className="loading-icon-pulse">
          <Boxes size={36} className="loading-box-icon" />
        </div>
        <div className="loading-text-group">
          <strong>Đang khởi tạo mô hình kho 3D</strong>
          <span className="loading-sub">Tối ưu hóa tài nguyên WebGL theo thời gian thực...</span>
        </div>
        <div className="loading-spinner-row">
          <Loader2 size={18} className="spinner-animate" />
          <span>Đang tải...</span>
        </div>
      </div>
    </div>
  )
}
