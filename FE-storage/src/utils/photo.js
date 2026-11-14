// Ảnh thật từ Unsplash, tải đúng kích thước theo màn hình (srcSet).
export function photo(id, alt, widths = [640, 1000, 1600]) {
  const url = (w) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`
  return { src: url(widths[1] ?? widths[0]), srcSet: widths.map((w) => `${url(w)} ${w}w`).join(', '), alt }
}
