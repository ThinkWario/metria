import { useRef, useCallback } from "react"

interface TiltOptions {
  maxTilt?: number
  scale?: number
  speed?: number
}

/**
 * GPU-accelerated magnetic tilt effect.
 * Uses ONLY `transform` and `will-change` — zero layout thrashing.
 * The browser delegates all work to the GPU compositor thread.
 */
export function useTilt({ maxTilt = 8, scale = 1.02, speed = 400 }: TiltOptions = {}) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const cx = rect.width / 2
      const cy = rect.height / 2

      // Normalize to [-1, 1]
      const nx = (x - cx) / cx
      const ny = (y - cy) / cy

      const rotateY = nx * maxTilt
      const rotateX = -ny * maxTilt

      el.style.transition = `transform ${speed * 0.3}ms cubic-bezier(0.23, 1, 0.32, 1)`
      el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`
    },
    [maxTilt, scale, speed]
  )

  const handleMouseLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = `transform ${speed}ms cubic-bezier(0.23, 1, 0.32, 1)`
    el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)"
  }, [speed])

  const handleMouseEnter = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = `transform ${speed * 0.3}ms cubic-bezier(0.23, 1, 0.32, 1)`
  }, [speed])

  return { ref, handleMouseMove, handleMouseLeave, handleMouseEnter }
}
