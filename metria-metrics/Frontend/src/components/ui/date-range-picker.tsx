"use client"

import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"


import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { useDateRangeStore } from "@/store/useDateRangeStore"

export function DateRangePicker({
    className,
}: React.HTMLAttributes<HTMLDivElement>) {
    const { date, setDate } = useDateRangeStore()

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-[300px] justify-start text-left font-normal bg-card/50 backdrop-blur-md border border-border/50",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "LLL dd, y", { locale: es })} -{" "}
                                    {format(date.to, "LLL dd, y", { locale: es })}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y", { locale: es })
                            )
                        ) : (
                            <span>Seleccionar fechas</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border border-border/50 bg-card/95 backdrop-blur-xl" align="end">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                        locale={es}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}
