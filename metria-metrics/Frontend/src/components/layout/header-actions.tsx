"use client"

import { usePathname } from "next/navigation"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"

export function HeaderActions() {
    const pathname = usePathname()
    // Omitir en la ruta de settings
    const isSettings = pathname?.includes("/dashboard/settings")

    if (isSettings) return null

    return (
        <div className="flex flex-col sm:flex-row items-center gap-2 mr-2">
            <DateRangePicker />
            <ExportButton />
        </div>
    )
}
