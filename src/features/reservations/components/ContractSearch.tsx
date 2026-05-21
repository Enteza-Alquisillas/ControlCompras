'use client'

import { useState } from 'react'
import { useReservationsStore } from '../store/useReservationsStore'
import { reservationsService } from '../services/reservationsService'

export function ContractSearch() {
    const [input, setInput] = useState('')
    const [searching, setSearching] = useState(false)
    const [notFound, setNotFound] = useState(false)
    const { navigateToRental } = useReservationsStore()

    const handleSearch = async () => {
        const num = parseInt(input.trim(), 10)
        if (isNaN(num) || !input.trim()) return
        setSearching(true)
        setNotFound(false)
        try {
            const rental = await reservationsService.searchByContract(num)
            if (!rental || !rental.event_date) {
                setNotFound(true)
                return
            }
            // Use noon to avoid timezone shifts on date-only strings
            const eventDate = new Date(rental.event_date + 'T12:00:00')
            navigateToRental(rental.id, eventDate)
            setInput('')
        } finally {
            setSearching(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch()
        else setNotFound(false)
    }

    return (
        <div className="flex items-center gap-2">
            <div className="relative">
                <input
                    type="number"
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setNotFound(false) }}
                    onKeyDown={handleKeyDown}
                    placeholder="Nº contrato..."
                    className={`w-36 pl-3 pr-2 py-1 text-xs border rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-400 ${notFound ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {notFound && (
                    <span className="absolute -bottom-4 left-0 text-[10px] text-red-500 whitespace-nowrap">
                        Contrato no encontrado
                    </span>
                )}
            </div>
            <button
                onClick={handleSearch}
                disabled={searching || !input.trim()}
                className="px-3 py-1 text-xs font-bold bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
                {searching ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                )}
                Buscar
            </button>
        </div>
    )
}
