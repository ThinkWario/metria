import { create } from 'zustand'
import { startOfMonth } from 'date-fns'
import { DateRange } from 'react-day-picker'

interface DateRangeState {
    date: DateRange
    setDate: (date: DateRange | undefined) => void
}

export const useDateRangeStore = create<DateRangeState>((set) => ({
    date: {
        from: startOfMonth(new Date()),
        to: new Date(),
    },
    setDate: (date) => set({ date: date || { from: undefined, to: undefined } }),
}))
