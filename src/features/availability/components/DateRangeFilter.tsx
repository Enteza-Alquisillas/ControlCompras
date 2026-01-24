'use client'

import { useFilterStore } from '../store/filterStore'

interface DateRangeFilterProps {
    className?: string
}

export function DateRangeFilter({ className = '' }: DateRangeFilterProps) {
    const { startDate, endDate, setStartDate, setEndDate, reset } = useFilterStore()

    const formatDateForInput = (date: Date) => {
        return date.toISOString().split('T')[0]
    }

    const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = new Date(e.target.value)
        setStartDate(newDate)
    }

    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = new Date(e.target.value)
        setEndDate(newDate)
    }

    return (
        <div className={`flex items-center gap-4 ${className}`}>
            <div className="flex items-center gap-2">
                <label htmlFor="startDate" className="text-sm text-gray-600">
                    Desde:
                </label>
                <input
                    type="date"
                    id="startDate"
                    value={formatDateForInput(startDate)}
                    onChange={handleStartDateChange}
                    max={formatDateForInput(endDate)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="endDate" className="text-sm text-gray-600">
                    Hasta:
                </label>
                <input
                    type="date"
                    id="endDate"
                    value={formatDateForInput(endDate)}
                    onChange={handleEndDateChange}
                    min={formatDateForInput(startDate)} className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <button
                onClick={reset}
                className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
                Resetear
            </button>
        </div>
    )
}
