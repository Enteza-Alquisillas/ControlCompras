'use client'

import { useEffect, useState } from 'react'
import { useReservationsStore } from '../store/useReservationsStore'
import { availabilityService } from '@/features/availability/services/availabilityService'
import { StockBreakage } from '@/features/availability/types'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

export function DailyAvailabilityTable() {
    const { selectedDate, selectedArticleId, setSelectedArticleId } = useReservationsStore()
    const [breakages, setBreakages] = useState<StockBreakage[]>([])
    const [familyMap, setFamilyMap] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const dateStr = format(selectedDate, 'yyyy-MM-dd')
                const data = await availabilityService.getStockBreakages(dateStr, dateStr)
                setBreakages(data)

                // Fetch family for each article
                if (data.length > 0) {
                    const articleIds = [...new Set(data.map(b => b.article_id))]
                    const supabase = createClient()
                    const { data: articles } = await supabase
                        .from('articles')
                        .select('id, family')
                        .in('id', articleIds)
                    const map: Record<string, string> = {}
                    articles?.forEach((a: { id: string; family: string | null }) => {
                        if (a.family) map[a.id] = a.family
                    })
                    setFamilyMap(map)
                }
            } catch (error) {
                console.error('Error loading daily availability:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [selectedDate])

    return (
        <div className="flex-1 bg-[#1A3A8A] border border-blue-900 rounded shadow-sm overflow-hidden flex flex-col">
            <div className="bg-[#4169E1] px-4 py-1 border-b border-blue-900">
                <h2 className="text-white font-bold text-sm tracking-widest uppercase">DISPONIBILIDAD</h2>
            </div>

            <div className="flex-1 overflow-auto bg-white">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#D1D5DB] text-[#1A3A8A] font-bold">
                        <tr>
                            <th className="border border-gray-400 px-2 py-1 text-left">DESCRIPCION</th>
                            <th className="border border-gray-400 px-2 py-1 text-left">CLASIFICACION</th>
                            <th className="border border-gray-400 px-2 py-1 text-right">TOTAL</th>
                            <th className="border border-gray-400 px-2 py-1 text-right">EXISTENCIA</th>
                            <th className="border border-gray-400 px-2 py-1 text-right">FALTA</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="p-4 text-center italic text-gray-500">Cargando...</td></tr>
                        ) : breakages.length === 0 ? (
                            <tr><td colSpan={5} className="p-4 text-center text-green-600 font-medium italic">Sin sobreventa para este día</td></tr>
                        ) : (
                            breakages.map((b) => (
                                <tr
                                    key={b.article_id}
                                    onClick={() => setSelectedArticleId(b.article_id)}
                                    className={`
                                        cursor-pointer transition-colors
                                        ${selectedArticleId === b.article_id ? 'bg-yellow-100 ring-2 ring-inset ring-yellow-400' : 'hover:bg-blue-50 even:bg-gray-50'}
                                    `}
                                >
                                    <td className="border border-gray-200 px-2 py-1 font-medium">{b.article_description}</td>
                                    <td className="border border-gray-200 px-2 py-1 text-gray-500 italic">{familyMap[b.article_id] || '—'}</td>
                                    <td className="border border-gray-200 px-2 py-1 text-right font-bold text-blue-800">{b.committed}</td>
                                    <td className="border border-gray-200 px-2 py-1 text-right text-gray-600">{b.total_stock}</td>
                                    <td className="border border-gray-200 px-2 py-1 text-right font-bold text-red-600">
                                        {Math.abs(b.available)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
