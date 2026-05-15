"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"

export function ModeToggle() {
    const { setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return <div className="h-8 w-8" />

    const isDark = resolvedTheme === "dark"

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="h-9 w-9 px-0 rounded-full relative overflow-hidden bg-accent/20 hover:bg-accent/40 transition-colors"
        >
            <AnimatePresence mode="wait">
                <motion.div
                    key={isDark ? "moon" : "sun"}
                    initial={{ y: 20, opacity: 0, rotate: -45 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: -20, opacity: 0, rotate: 45 }}
                    transition={{ duration: 0.4, ease: "backOut" }}
                >
                    {isDark ? (
                        <Moon className="h-[1.1rem] w-[1.1rem] text-blue-400" />
                    ) : (
                        <Sun className="h-[1.1rem] w-[1.1rem] text-amber-500" />
                    )}
                </motion.div>
            </AnimatePresence>
            <span className="sr-only">Toggle theme</span>
        </Button>
    )
}
