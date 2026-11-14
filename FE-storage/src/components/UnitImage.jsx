// Ảnh của một loại kho: dùng ảnh riêng (imageUrl) nếu có và tải được,
// ngược lại dùng ảnh thật theo cỡ kho (nhỏ / vừa / lớn).
import { useEffect, useState } from 'react'
import { assetUrl } from '../api/client.js'
import { unitPhoto } from '../utils/unitPhotos.js'

export default function UnitImage({ imageUrl, name = '', width, length, booked, className = '', style, sizes = '(max-width: 700px) 100vw, 33vw' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [imageUrl])
  const base = { width: '100%', aspectRatio: '5 / 3', objectFit: 'cover', display: 'block', borderRadius: 14, filter: booked ? 'grayscale(0.8)' : undefined, ...style }

  if (imageUrl && !failed) {
    return <img src={assetUrl(imageUrl)} alt={`${name} storage unit`.trim()} loading="lazy" onError={() => setFailed(true)} className={className} style={base} />
  }
  const p = unitPhoto({ width, length })
  return <img src={p.src} srcSet={p.srcSet} sizes={sizes} alt={p.alt} loading="lazy" decoding="async" className={className} style={base} />
}
