"use client"

import React from "react"
import type { Payload, TooltipProps } from "recharts"

interface ChartTooltipProps {
    active?: boolean
    payload?: Payload<number, string>[]
    label?: React.ReactNode
    labelFormatter?: (label: React.ReactNode) => React.ReactNode
    valueFormatter?: (value: number, name: string) => React.ReactNode
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: ChartTooltipProps) {
    if (!active || !payload || payload.length === 0) return null

    return (
        <div
            className="rounded-lg border border-border/50 bg-card/95 backdrop-blur-md px-3 py-2 shadow-xl text-foreground"
            style={{ minWidth: 120 }}
        >
            <p className="text-xs text-muted-foreground mb-1 font-medium">
                {labelFormatter ? labelFormatter(label) : label}
            </p>
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground capitalize">{entry.name}:</span>
                    <span className="font-semibold text-foreground">
                        {valueFormatter ? valueFormatter(entry.value as number, entry.name as string) : entry.value}
                    </span>
                </div>
            ))}
        </div>
    )
}

// Shared axis tick style for charts — use these props on XAxis / YAxis
export const axisTickStyle = {
    fill: "hsl(var(--muted-foreground, 215 20% 65%))",
    fontSize: 12,
}
