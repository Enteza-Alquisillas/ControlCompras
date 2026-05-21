'use client'

import { useEffect, useState } from 'react'
import { useReservationsStore } from '../store/useReservationsStore'
import { reservationsService } from '../services/reservationsService'
import { RentalWithCustomer } from '../types'
import { estimateSeats } from '../utils/estimateSeats'
import { format } from 'date-fns'

export function DailyRentalsTable() {
    const { selectedDate, setSelectedRentalId, setDetailModalOpen, selectedArticleId } = useReservationsStore()
    const [rentals, setRentals] = useState<RentalWithCustomer[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const dateStr = format(selectedDate, 'yyyy-MM-dd')
                const data = await reservationsService.getRentalsByDate(dateStr)
                setRentals(data)
            } catch (error) {
                console.error('Error loading daily rentals:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [selectedDate])

    const handleRowClick = (id: string) => {
        setSelectedRentalId(id)
        setDetailModalOpen(true)
    }

    return (
        <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="overflow-auto flex-1">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#E5E7EB] text-gray-700 font-bold border-b border-gray-400">
                        <tr>
                            <th className="border-r border-gray-300 px-2 py-1.5 text-left w-16">CONTRATO</th>
                            <th className="border-r border-gray-300 px-2 py-1.5 text-left">CLIENTE</th>
                            <th className="border-r border-gray-300 px-2 py-1.5 text-center w-24">ENTREGA</th>
                            <th className="border-r border-gray-300 px-2 py-1.5 text-center w-24">RECOGIDA</th>
                            <th className="border-r border-gray-300 px-2 py-1.5 text-center w-16">PLAZAS</th>
                            <th className="border-r border-gray-300 px-2 py-1.5 text-left">LUGAR</th>
                            <th className="px-2 py-1.5 text-left">NOTAS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={7} className="p-10 text-center italic text-gray-500">Buscando eventos...</td></tr>
                        ) : rentals.length === 0 ? (
                            <tr><td colSpan={7} className="p-10 text-center text-gray-400 italic">No hay eventos para esta fecha</td></tr>
                        ) : (
                            rentals
                            .filter((r: RentalWithCustomer) => !selectedArticleId || r.items?.some(item => item.article_id === selectedArticleId))
                            .map((r) => {
                                const containsSelectedArticle = selectedArticleId && r.items?.some(item => item.article_id === selectedArticleId);
                                const seatEstimate = estimateSeats(r.items || [])

                                return (
                                    <tr
                                        key={r.id}
                                        onClick={() => handleRowClick(r.id)}
                                        className={`
                                            hover:bg-blue-50 cursor-pointer even:bg-gray-50 transition-colors group
                                            ${containsSelectedArticle ? 'bg-red-50' : ''}
                                        `}
                                    >
                                        <td className="border-r border-gray-200 px-2 py-1 font-mono text-blue-700 group-hover:font-bold">
                                            {r.legacy_id || r.id.slice(0, 5)}
                                        </td>
                                        <td className={`
                                            border-r border-gray-200 px-2 py-1 font-medium
                                            ${containsSelectedArticle ? 'text-red-600 font-bold underline' : ''}
                                        `}>
                                            {r.customer?.name || 'S/N'}
                                        </td>
                                        <td className="border-r border-gray-200 px-2 py-1 text-center font-bold text-green-700">
                                            {r.delivery_date ? format(new Date(r.delivery_date), 'dd/MM') : '-'}
                                        </td>
                                        <td className="border-r border-gray-200 px-2 py-1 text-center font-bold text-red-700">
                                            {r.pickup_date ? format(new Date(r.pickup_date), 'dd/MM') : '-'}
                                        </td>
                                        <td className="border-r border-gray-200 px-2 py-1 text-center">
                                            {seatEstimate ? (
                                                <span
                                                    className="inline-flex items-center gap-1 font-bold"
                                                    style={{ color: seatEstimate.source === 'plaza' ? '#7c3aed' : '#9333ea' }}
                                                    title={seatEstimate.source === 'plaza' ? 'Precio por plaza' : 'Estimado por sillas'}
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    {seatEstimate.seats}
                                                    {seatEstimate.source === 'silla' && <span className="text-[9px] font-normal opacity-60">~</span>}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300">—</span>
                                            )}
                                        </td>
                                        <td className="border-r border-gray-200 px-2 py-1 truncate max-w-[200px]" title={r.delivery_address || ''}>
                                            {r.delivery_address || 'N/A'}
                                        </td>
                                        <td className="px-2 py-1 italic text-gray-500 truncate max-w-[300px]" title={r.notes || ''}>
                                            {r.notes || '-'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
