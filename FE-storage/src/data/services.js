import { Warehouse } from 'lucide-react'

// Mô tả dịch vụ kho (tĩnh), dùng chung cho trang Services và Pricing.
export const SERVICES = [
  {
    category: 'STANDARD',
    icon: Warehouse,
    title: 'Kho tiêu chuẩn',
    text: 'Ô kho khô ráo, an toàn cho đồ dùng hằng ngày và hàng hóa kinh doanh.',
    suitable: 'Đồ nội thất, đồ gia dụng, tài liệu, thiết bị, hàng của cửa hàng và hàng thương mại điện tử.',
    features: ['Ô kho nhỏ, vừa và lớn', 'Khô ráo, sạch sẽ, thông thoáng', 'Giám sát an ninh 24/7', 'Ra vào linh hoạt, có đặt lịch xem kho và nhận, trả kho'],
    terms: ['Thuê theo tháng, mỗi lần đặt 1 hoặc 2 tháng', 'Tiền cọc được hoàn lại khi kết thúc hợp đồng', 'Gia hạn trước khi hết hạn (tối đa 2 tháng mỗi lần)'],
    adviceSubject: 'Tư vấn về kho tiêu chuẩn',
  },
]
