import { create } from 'zustand'

interface FilterState {
    startDate: Date
    endDate: Date
    setStartDate: (date: Date) => void
    setEndDate: (date: Date) => void
    setDateRange: (start: Date, end: Date) => void
    reset: () => void
}

// Default: today → end of year
const today = new Date()
const endOfYear = new Date(today.getFullYear(), 11, 31) // Dec 31

export const useFilterStore = create<FilterState>((set) => ({
    startDate: today,
    endDate: endOfYear,

    setStartDate: (date) => set({ startDate: date }),

    setEndDate: (date) => set({ endDate: date }),

    setDateRange: (start, end) => set({ startDate: start, endDate: end }),

    reset: () => set({ startDate: today, endDate: endOfYear }),
}))
