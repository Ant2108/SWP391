import { ChevronDown } from 'lucide-react'

/** Danh sách câu hỏi thường gặp, mở/đóng bằng <details> nên dùng được cả bàn phím lẫn trình đọc màn hình. */
export default function Faq({ items }) {
  return (
    <div className="faq">
      {items.map(({ q, a }) => (
        <details key={q} className="faq-item">
          <summary>{q}<ChevronDown size={20} aria-hidden="true" /></summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  )
}
