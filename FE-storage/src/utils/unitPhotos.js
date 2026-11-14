import { photo } from './photo.js'
import { sizeBucket } from './unitFilter.js'

// Ảnh thật cho loại kho chưa có ảnh riêng: chọn theo cỡ (nhỏ / vừa / lớn).
export const UNIT_PHOTOS = {
  S: photo('1580674285054-bed31e145f59', 'Thùng hàng và bưu kiện xếp gọn trong một ô kho nhỏ'),
  M: photo('1609143739217-01b60dad1c67', 'Khu kho với thùng hàng xếp chồng trên pallet'),
  L: photo('1616401784845-180882ba9ba8', 'Khu kho lớn có kệ pallet và xe nâng'),
}

export const unitPhoto = (t) => UNIT_PHOTOS[sizeBucket(t || {})] || (sizeBucket(t || {}) === 'XL' ? UNIT_PHOTOS.L : UNIT_PHOTOS.M)

// Ảnh phụ cho thư viện ảnh ở trang chi tiết loại kho.
export const GALLERY_EXTRA = [
  photo('1590247813693-5541d1c609fd', 'Kệ chứa các thùng hồ sơ có dán nhãn', [400, 800, 1200]),
  photo('1586528116311-ad8dd3c8310d', 'Sàn cơ sở kho với các dãy thùng chứa', [400, 800, 1200]),
]

export const SIZE_LABEL = { S: 'Nhỏ', M: 'Vừa', L: 'Lớn', XL: 'Rất lớn' }
