import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Cuộn mượt bằng Lenis, đồng bộ với GSAP ScrollTrigger. Chỉ bật ở trang chủ;
// các vùng tự cuộn (modal, menu, thông báo) được bỏ qua để vẫn cuộn bình thường.
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      prevent: (node) => !!node.closest?.('.modal, .modal-backdrop, .bell-list, .bell-panel, .nav-dropdown-menu, .user-dropdown, .mobile-menu'),
    })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33)
      lenis.destroy()
    }
  }, [])
}
