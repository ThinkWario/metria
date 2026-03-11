import { useEffect, useState } from "react"

/**
 * Smart skeleton hook that avoids the "flash of loading state"
 * on fast connections. Only shows the skeleton if the data
 * takes longer than `delay` ms to arrive.
 *
 * Benefits:
 * - On fast connections (< 200ms): no skeleton flash, data "just appears"
 * - On slow connections (> 200ms): skeleton appears smoothly
 * - Fade-in transition on reveal prevents jarring snap
 */
export function useSmartSkeleton(isLoading: boolean, delay = 200) {
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [fadeIn, setFadeIn] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false)
      // Trigger fade-in of the real content
      const tid = setTimeout(() => setFadeIn(true), 30)
      return () => clearTimeout(tid)
    }

    setFadeIn(false)
    const tid = setTimeout(() => {
      if (isLoading) setShowSkeleton(true)
    }, delay)

    return () => clearTimeout(tid)
  }, [isLoading, delay])

  return { showSkeleton, fadeIn }
}
