"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useTilt } from "@/hooks/useTilt"

interface TiltCardProps extends React.ComponentProps<"div"> {
  tiltIntensity?: "subtle" | "medium" | "strong"
  children: React.ReactNode
}

const intensityMap = {
  subtle: { maxTilt: 4, scale: 1.015, speed: 500 },
  medium: { maxTilt: 8, scale: 1.025, speed: 400 },
  strong: { maxTilt: 14, scale: 1.04, speed: 300 },
}

/**
 * TiltCard — Drop-in replacement for Card that adds GPU-accelerated
 * 3D magnetic hover effect. Uses only CSS `transform` + `will-change`
 * so the browser compositor handles it entirely on the GPU.
 * Zero layout thrashing, zero performance impact.
 */
export function TiltCard({
  className,
  tiltIntensity = "subtle",
  children,
  ...props
}: TiltCardProps) {
  const opts = intensityMap[tiltIntensity]
  const { ref, handleMouseMove, handleMouseLeave, handleMouseEnter } = useTilt(opts)

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      style={{ willChange: "transform", transformStyle: "preserve-3d" }}
      className={cn(
        // Base card styles matching the existing Card component
        "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        // Enhanced glassmorphism
        "bg-card/30 backdrop-blur-xl border-border/50",
        // Subtle glow on hover via box-shadow (GPU composited)
        "hover:shadow-lg hover:shadow-primary/5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
