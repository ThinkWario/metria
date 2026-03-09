import { create } from 'zustand'
import { addDays } from 'date-fns'
import { DateRange } from 'react-day-picker'

interface DateRangeState {
    date: DateRange
    setDate: (date: DateRange | undefined) => void
}

export const useDateRangeStore = create<DateRangeState>((set) => ({
    date: {
        from: undefined,
        to: undefined,
    },
    setDate: (date) => set({ date: date || { from: undefined, to: undefined } }),
}))
