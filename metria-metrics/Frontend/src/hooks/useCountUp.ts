import { useEffect, useRef, useState } from "react"

interface CountUpOptions {
  duration?: number
  decimals?: number
  easing?: "linear" | "ease-out"
}

/**
 * Animates a number from 0 to `target` using requestAnimationFrame.
 * Zero external dependencies — uses native browser APIs.
 * The animation is kicked off only when the value first becomes non-zero,
 * so it triggers naturally on data load.
 */
export function useCountUp(
  target: number,
  { duration = 900, decimals = 0, easing = "ease-out" }: CountUpOptions = {}
): number {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const prevTarget = useRef<number>(0)

  useEffect(() => {
    if (target === prevTarget.current) return
    const start = prevTarget.current
    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)

      const easedProgress =
        easing === "ease-out" ? 1 - Math.pow(1 - progress, 3) : progress

      const current = start + (target - start) * easedProgress
      const rounded = decimals > 0 ? current : Math.round(current)
      setDisplay(rounded)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevTarget.current = target
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, decimals, easing])

  return display
}
