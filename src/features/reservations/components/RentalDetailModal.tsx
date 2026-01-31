'use client'

import { useEffect, useState, Fragment } from 'react'
import { useReservationsStore } from '../store/useReservationsStore'
import { reservationsService } from '../services/reservationsService'
import { RentalItemWithArticle, RentalWithCustomer } from '../types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function RentalDetailModal() {
    const { selectedRentalId, isDetailModalOpen, setDetailModalOpen } = useReservationsStore()
    const [rental, setRental] = useState<RentalWithCustomer | null>(null)
    const [items, setItems] = useState<RentalItemWithArticle[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isDetailModalOpen && selectedRentalId) {
            async function loadData() {
                const id = selectedRentalId
                if (!id) return
                setLoading(true)
                try {
                    const [rentalData, itemsData] = await Promise.all([
                        reservationsService.getRentalDetail(id),
                        reservationsService.getRentalItems(id)
                    ])
                    setRental(rentalData)
                    setItems(itemsData)
                } catch (error) {
                    console.error('Error loading rental data:', error)
                    setItems([])
                    setRental(null)
                } finally {
                    setLoading(false)
                }
            }
            loadData()
        }
    }, [isDetailModalOpen, selectedRentalId])

    if (!isDetailModalOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-[#1A3A8A] px-6 py-4 flex justify-between items-center">
                    <h2 className="text-white font-bold text-lg uppercase tracking-wider">Detalle del Evento</h2>
                    <button
                        onClick={() => setDetailModalOpen(false)}
                        className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-gray-50 flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 grayscale opacity-50">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-800 mb-4"></div>
                            <p className="text-sm font-medium">Cargando información del evento...</p>
                        </div>
                    ) : (
                        <>
                            {/* Rental Header Info */}
                            {rental && (
                                <div className="bg-white p-6 border-b border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Folio (Legacy)</p>
                                        <p className="text-sm font-black text-blue-900 font-mono">#{rental.legacy_id || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Cliente</p>
                                        <p className="text-sm font-bold text-gray-900">{rental.customer?.name || 'S/N'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Lugar del Evento</p>
                                        <p className="text-sm font-medium text-gray-700 truncate" title={rental.delivery_address || ''}>
                                            {rental.delivery_address || 'Sin dirección registrada'}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">Fecha Evento</p>
                                        <p className="text-sm font-bold text-blue-900 bg-blue-50 px-2 py-1 rounded inline-block">
                                            {rental.event_date ? format(new Date(rental.event_date), "dd 'de' MMMM, yyyy", { locale: es }) : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="space-y-1 border-l md:border-l-0 md:pl-0 pl-4 border-gray-100">
                                        <p className="text-[10px] font-bold text-green-600 uppercase tracking-tighter">Fecha Entrega</p>
                                        <p className="text-sm font-medium text-gray-900">
                                            {rental.delivery_date ? format(new Date(rental.delivery_date), "dd/MM/yyyy") : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="space-y-1 border-l md:border-l-0 md:pl-0 pl-4 border-gray-100">
                                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-tighter">Fecha Recogida</p>
                                        <p className="text-sm font-medium text-gray-900">
                                            {rental.pickup_date ? format(new Date(rental.pickup_date), "dd/MM/yyyy") : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="px-6 pb-6 mt-4">
                                {items.length === 0 ? (
                                    <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                                        <p className="text-gray-500 italic">No hay artículos registrados para este folio.</p>
                                    </div>
                                ) : (
                                    <div className="border border-gray-300 rounded overflow-hidden bg-white shadow-sm">
                                        <table className="w-full text-xs border-collapse">
                                            <thead className="bg-[#E5E7EB] text-gray-700 font-bold border-b border-gray-400">
                                                <tr>
                                                    <th className="border-r border-gray-300 px-2 py-1.5 text-left">ARTICULO</th>
                                                    <th className="border-r border-gray-300 px-2 py-1.5 text-left w-24">CÓDIGO</th>
                                                    <th className="border-r border-gray-300 px-2 py-1.5 text-center w-20">CANTIDAD</th>
                                                    <th className="px-2 py-1.5 text-left">NOTAS</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {(() => {
                                                    // Group items by family
                                                    const groups: Record<string, RentalItemWithArticle[]> = {}
                                                    items.forEach(item => {
                                                        const family = item.article?.family || 'SIN FAMILIA'
                                                        if (!groups[family]) groups[family] = []
                                                        groups[family].push(item)
                                                    })

                                                    // Sort families alphabetically
                                                    const sortedFamilies = Object.keys(groups).sort()

                                                    return sortedFamilies.map(family => (
                                                        <Fragment key={family}>
                                                            {/* Family Header Row */}
                                                            <tr className="bg-blue-50/30">
                                                                <td colSpan={4} className="px-2 py-1.5 text-[10px] font-black text-blue-900/40 uppercase tracking-widest border-b border-blue-100">
                                                                    {family}
                                                                </td>
                                                            </tr>
                                                            {/* Items in this family */}
                                                            {groups[family]
                                                                .sort((a, b) => (a.article?.description || '').localeCompare(b.article?.description || ''))
                                                                .map((item) => (
                                                                    <tr key={item.id} className="hover:bg-blue-50 transition-colors even:bg-gray-50/50">
                                                                        <td className="border-r border-gray-200 px-2 py-1 font-medium text-gray-900">
                                                                            {item.article?.description || 'Artículo Desconocido'}
                                                                        </td>
                                                                        <td className="border-r border-gray-200 px-2 py-1 text-gray-600 font-mono">
                                                                            {item.article?.code || 'N/A'}
                                                                        </td>
                                                                        <td className="border-r border-gray-200 px-2 py-1 text-center font-bold text-blue-700">
                                                                            {item.quantity}
                                                                        </td>
                                                                        <td className="px-2 py-1 text-gray-500 italic">
                                                                            {item.notes || '-'}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                        </Fragment>
                                                    ))
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-100 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={() => setDetailModalOpen(false)}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition-colors border border-gray-300 shadow-sm"
                    >
                        Cerrar Ventana
                    </button>
                </div>
            </div>
        </div>
    )
}
