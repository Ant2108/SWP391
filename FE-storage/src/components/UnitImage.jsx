// Ảnh của một loại kho: dùng ảnh thật (imageUrl) nếu có và tải được, ngược lại vẽ ảnh minh họa SVG
// theo loại kho (Standard / Cold) và kích thước.
import { useEffect, useState } from 'react'
import { assetUrl } from '../api/client.js'

const THEME = {
  STANDARD: { sky: '#FFF6D6', wall: '#F3E4B0', door: '#F9B800', slat: '#D99E00', frame: '#8A6A00' },
  COLD: { sky: '#E6F2FF', wall: '#C9E2FA', door: '#7DB7F0', slat: '#4E94DC', frame: '#2B5F94' },
}

export default function UnitImage({ imageUrl, category = 'STANDARD', name = '', width, length, height, booked, className = '', style }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [imageUrl])
  const c = THEME[category] || THEME.STANDARD
  // Cửa to hơn khi kho rộng hơn (diện tích rộng x dài), giới hạn trong khung.
  const area = Math.max(Number(width) * Number(length) || 4, 1)
  const doorW = Math.min(250, 120 + area * 8)
  const doorH = 130
  const x = (400 - doorW) / 2
  const slats = Math.max(5, Math.min(9, Math.round(Number(height) * 3) || 7))
  const label = `${name} ${category === 'COLD' ? 'cold' : 'standard'} storage unit`.trim()

  if (imageUrl && !failed) {
    return (
      <img src={assetUrl(imageUrl)} alt={label} loading="lazy" onError={() => setFailed(true)} className={className}
        style={{ width: '100%', aspectRatio: '5 / 3', objectFit: 'cover', display: 'block', borderRadius: 14, filter: booked ? 'grayscale(0.8)' : undefined, ...style }} />
    )
  }

  return (
    <svg viewBox="0 0 400 240" role="img" aria-label={label} className={className}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 14, filter: booked ? 'grayscale(0.8)' : undefined, ...style }}>
      <rect width="400" height="240" fill={c.sky} />
      <rect x="0" y="170" width="400" height="70" fill={c.wall} />
      <rect x={x - 14} y={40} width={doorW + 28} height={doorH + 24} rx="8" fill={c.frame} />
      <rect x={x} y={52} width={doorW} height={doorH} rx="4" fill={c.door} />
      {Array.from({ length: slats }, (_, i) => (
        <line key={i} x1={x} x2={x + doorW} y1={52 + ((i + 1) * doorH) / (slats + 1)} y2={52 + ((i + 1) * doorH) / (slats + 1)} stroke={c.slat} strokeWidth="3" />
      ))}
      <rect x={200 - 14} y={52 + doorH - 14} width="28" height="8" rx="4" fill={c.frame} />
      {category === 'COLD' && (
        <g stroke="#fff" strokeWidth="3" strokeLinecap="round" transform="translate(200 108)">
          {[0, 60, 120].map((deg) => <line key={deg} x1="-22" y1="0" x2="22" y2="0" transform={`rotate(${deg})`} />)}
        </g>
      )}
      <text x="200" y="214" textAnchor="middle" fontSize="20" fontWeight="600" fill={c.frame} fontFamily="Inter, system-ui, sans-serif">{name}</text>
    </svg>
  )
}
