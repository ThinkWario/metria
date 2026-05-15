"use client"

import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

export function SkylineBackground() {
    const { theme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    const isDark = resolvedTheme === "dark"

    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            {/* Base Background Transition */}
            <motion.div
                initial={false}
                animate={{
                    background: isDark 
                        ? "radial-gradient(circle at 50% -20%, #1a1a2e 0%, #050505 100%)"
                        : "radial-gradient(circle at 50% -20%, #e0f2fe 0%, #ffffff 100%)",
                }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
                className="absolute inset-0"
            />

            {/* Skyline Atmospheric Glow */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={isDark ? "dark" : "light"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.25 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: "linear" }}
                    className="absolute inset-0"
                    style={{
                        background: isDark
                            ? "linear-gradient(to bottom, #f59e0b 0%, transparent 40%, transparent 100%)" // Sunset glow lingering
                            : "linear-gradient(to bottom, #60a5fa 0%, transparent 50%, transparent 100%)", // Morning fresh blue
                    }}
                />
            </AnimatePresence>

            {/* Subtle Stars for Dark Mode */}
            {isDark && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 2 }}
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: `radial-gradient(white 1px, transparent 0)`,
                        backgroundSize: '40px 40px',
                    }}
                />
            )}
        </div>
    )
}
