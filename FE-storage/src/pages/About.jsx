import { Link } from 'react-router-dom'
import { ShieldCheck, Eye, Lock, Users, Check, ArrowRight, Cctv, MapPin, Boxes, Headset } from 'lucide-react'
import { Card } from '../components/ui.jsx'
import { photo } from '../utils/photo.js'

const VALUES = [
  { icon: ShieldCheck, title: 'An ninh là trên hết', text: 'Cơ sở được giám sát và kiểm soát ra vào ở mọi địa điểm.' },
  { icon: Eye, title: 'Minh bạch', text: 'Quy tắc giá rõ ràng để bạn luôn biết mình trả bao nhiêu và vì sao.' },
  { icon: Lock, title: 'Riêng tư', text: 'Đồ đạc của bạn vẫn là của bạn. Chỉ bạn quyết định ai được tiếp cận.' },
  { icon: Users, title: 'Hỗ trợ thực sự', text: 'Nhân viên thân thiện luôn sẵn sàng giúp bạn chọn và quản lý không gian.' },
]

const IMG = {
  aisle: photo('1553413077-190dd305871c', 'Lối đi trong kho dài với kệ cao chứa nhiều thùng hàng'),
  yellow: photo('1586528116311-ad8dd3c8310d', 'Sàn kho với các dãy thùng chứa màu vàng'),
  parcels: photo('1580674285054-bed31e145f59', 'Thùng hàng và bưu kiện xếp chồng sẵn sàng để lưu kho'),
  cctv: photo('1557597774-9d273605dfa9', 'Dãy camera an ninh'),
  aerial: photo('1565891741441-64926e441838', 'Toàn cảnh cơ sở kho nhìn từ trên cao với khu bốc dỡ hàng'),
  shelves: photo('1587293852726-70cdb56c2866', 'Kệ cao chất đầy thùng hàng trên pallet'),
  staff: photo('1590650153855-d9e808231d41', 'Nhân viên mỉm cười tại bàn làm việc trong văn phòng kho'),
}

const GALLERY = [
  { img: IMG.cctv, icon: Cctv, title: 'Giám sát 24/7', text: 'Camera, cổng mã PIN và báo động ô kho ở mọi cơ sở.' },
  { img: IMG.aerial, icon: MapPin, title: 'Dễ tìm đến', text: 'Khu bốc dỡ hàng thuận tiện, gần trung tâm thành phố.' },
  { img: IMG.shelves, icon: Boxes, title: 'Chứa được mọi thứ', text: 'Từ vài thùng hàng đến cả pallet hàng của doanh nghiệp.' },
]

// Ảnh có khung bo góc, phóng nhẹ khi rê chuột.
function Photo({ img, sizes, className = '', eager }) {
  return (
    <figure className={`about-photo ${className}`}>
      <img src={img.src} srcSet={img.srcSet} sizes={sizes} alt={img.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  )
}

export default function About() {
  return (
    <>
      {/* Mở đầu: chữ bên trái, cụm ảnh thật bên phải */}
      <section className="section about-hero">
        <div className="container about-hero-grid">
          <div>
            <div className="eyebrow">Giới thiệu</div>
            <h1 className="about-title">Nơi gửi đồ bạn có thể tin cậy</h1>
            <p className="lead">
              SafeSpace Storage cung cấp dịch vụ kho an toàn, linh hoạt cho hộ gia đình và doanh nghiệp, từ một thùng hàng đến cả khu kho.
            </p>
            <div className="about-actions">
              <Link to="/storage-options" className="btn-pill lg">Xem các loại kho <ArrowRight size={18} /></Link>
              <Link to="/locations" className="btn-pill btn-pill-ghost lg">Các cơ sở kho</Link>
            </div>
          </div>
          <div className="about-collage">
            <Photo img={IMG.aisle} sizes="(max-width: 900px) 90vw, 40vw" className="about-collage-main" eager />
            <Photo img={IMG.yellow} sizes="(max-width: 900px) 50vw, 22vw" className="about-collage-small" eager />
            <div className="about-badge">
              <span className="about-badge-icon"><ShieldCheck size={20} /></span>
              <div><strong>Giám sát 24/7</strong><small>Mọi cơ sở, mỗi ngày</small></div>
            </div>
          </div>
        </div>
      </section>

      {/* Giá trị */}
      <section className="about-values">
        <div className="container">
          <div className="grid grid-4">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <Card hover key={title}>
                <div className="icon-tile"><Icon size={26} /></div>
                <h3>{title}</h3>
                <p className="muted" style={{ marginTop: 8 }}>{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Dịch vụ: ảnh + danh sách */}
      <section className="section">
        <div className="container about-split about-split-photo">
          <Photo img={IMG.parcels} sizes="(max-width: 800px) 100vw, 45vw" className="about-tall" />
          <div>
            <div className="eyebrow">Chúng tôi cung cấp</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,42px)' }}>Kho phù hợp với cách bạn sống và làm việc</h2>
            <p className="muted" style={{ marginTop: 12 }}>
              Dù bạn dọn bớt một phòng, cất đồ theo mùa hay lưu hàng cho doanh nghiệp, bạn đều có thể tìm, xem giá và đặt ô kho trực tuyến.
            </p>
            <ul>
              <li><Check size={18} /><span>Kho tiêu chuẩn cho nội thất, tài liệu, thiết bị và hàng hóa</span></li>
              <li><Check size={18} /><span>Giá thuê tháng và tiền cọc rõ ràng, hiển thị trước khi thanh toán</span></li>
              <li><Check size={18} /><span>Lịch hẹn, thanh toán và hỗ trợ trong một tài khoản</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Bên trong cơ sở: 3 ảnh thật có chú thích */}
      <section className="section band">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">Bên trong cơ sở của chúng tôi</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,42px)' }}>Được xây dựng để giữ đồ đạc của bạn an toàn</h2>
          </div>
          <div className="about-gallery">
            {GALLERY.map(({ img, icon: Icon, title, text }) => (
              <article key={title} className="about-gallery-card">
                <Photo img={img} sizes="(max-width: 800px) 100vw, 33vw" />
                <div className="about-gallery-body">
                  <span className="about-gallery-icon"><Icon size={16} /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Hỗ trợ: ảnh nhân viên + lời kêu gọi */}
      <section className="section">
        <div className="container">
          <div className="about-support">
            <Photo img={IMG.staff} sizes="(max-width: 800px) 100vw, 40vw" className="about-support-photo" />
            <div className="about-support-body">
              <span className="about-gallery-icon"><Headset size={16} /></span>
              <h2>Đơn giản từ đầu đến cuối</h2>
              <p>
                Chọn cơ sở, chọn cỡ kho, đóng cọc trực tuyến là ô kho được giữ cho bạn. Nhân viên luôn sẵn sàng hỗ trợ qua trang Hỗ trợ mỗi khi bạn cần giúp chọn hoặc quản lý không gian.
              </p>
              <div className="about-actions">
                <Link to="/storage-options" className="btn-pill lg">Xem các loại kho</Link>
                <Link to="/contact" className="btn-pill btn-pill-ghost lg">Liên hệ chúng tôi</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
