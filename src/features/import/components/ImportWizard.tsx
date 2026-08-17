'use client'

import { useState } from 'react'
import { importService } from '../services/importService'
import { ImportResult } from '../types'
import { Odoo19InventoryPreviewModal } from './Odoo19InventoryPreviewModal'

export function ImportWizard() {
    const [warehouse, setWarehouse] = useState<'SEVILLA' | 'JEREZ'>('SEVILLA')
    const [importing, setImporting] = useState<string | null>(null)
    const [results, setResults] = useState<ImportResult[]>([])
    const [showOdoo19Inventory, setShowOdoo19Inventory] = useState(false)

    const runImport = async (table: 'articles' | 'customers' | 'rentals') => {
        setImporting(table)

        let result: ImportResult
        if (table === 'articles') {
            result = await importService.importArticles(warehouse)
        } else if (table === 'customers') {
            result = await importService.importCustomers(warehouse)
        } else {
            result = await importService.importRentals(warehouse)
        }

        setResults(prev => [result, ...prev.filter(r => r.table !== table || r.error)])
        setImporting(null)
    }

    const handleResetRentals = async () => {
        if (!confirm('¿Estás seguro de que deseas borrar TODAS las reservas? Esta acción no se puede deshacer y es necesaria para una importación limpia.')) {
            return
        }

        setImporting('reset')
        const result = await importService.resetRentals()
        setResults(prev => [result, ...prev])
        setImporting(null)

        if (result.success) {
            alert('Reservas borradas correctamente. Ahora puedes proceder con una importación limpia.')
        } else {
            alert('Error al borrar reservas: ' + result.error)
        }
    }

    const getTableLabel = (table: string) => {
        const labels: Record<string, string> = {
            articles: 'Artículos y Stock',
            customers: 'Clientes',
            rentals: 'Reservas y Alquileres'
        }
        return labels[table] || table
    }

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Pasos de Sincronización</h3>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700">Almacén Origen:</label>
                            <select
                                value={warehouse}
                                onChange={(e) => setWarehouse(e.target.value as any)}
                                className="px-3 py-1 bg-gray-50 border border-gray-300 rounded-md text-sm"
                                disabled={importing !== null}
                            >
                                <option value="SEVILLA">SEVILLA</option>
                                <option value="JEREZ">JEREZ</option>
                            </select>
                        </div>

                        <button
                            onClick={handleResetRentals}
                            disabled={importing !== null}
                            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                            {importing === 'reset' ? 'Limpiando...' : 'Vaciar Reservas'}
                        </button>
                    </div>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {['articles', 'customers', 'rentals'].map((table) => (
                            <div key={table} className="border rounded-lg p-4 flex flex-col justify-between h-40">
                                <div>
                                    <h4 className="font-medium text-gray-900">{getTableLabel(table)}</h4>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {table === 'articles' && 'Sincroniza catálogo de materiales y existencias actuales.'}
                                        {table === 'customers' && 'Sincroniza base de datos de clientes corporativos.'}
                                        {table === 'rentals' && 'Sincroniza eventos confirmados y líneas de reserva.'}
                                    </p>
                                </div>

                                <button
                                    onClick={() => runImport(table as any)}
                                    disabled={importing !== null}
                                    className="mt-4 w-full py-2 bg-gray-900 text-white rounded hover:bg-black transition-colors disabled:opacity-50 text-sm font-medium"
                                >
                                    {importing === table ? 'Sincronizando...' : 'Sincronizar Ahora'}
                                </button>
                            </div>
                        ))}

                        <div className="border rounded-lg p-4 flex flex-col justify-between h-40">
                            <div>
                                <h4 className="font-medium text-gray-900">Inventario Odoo 19</h4>
                                <p className="text-xs text-gray-500 mt-1">
                                    Carga existencias reales (Sevilla/Jerez) como ajuste de inventario en Odoo 19, por compañía.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowOdoo19Inventory(true)}
                                className="mt-4 w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm font-medium"
                            >
                                Revisar y cargar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showOdoo19Inventory && <Odoo19InventoryPreviewModal onClose={() => setShowOdoo19Inventory(false)} />}

            {results.length > 0 && (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Resultados de Sincronización</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {results.map((result, idx) => (
                                <div
                                    key={idx}
                                    className={`p-4 rounded-md border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                                                {getTableLabel(result.table)}
                                            </p>
                                            {result.success ? (
                                                <p className="text-sm text-green-600">Sincronización completada: {result.count} registros procesados.</p>
                                            ) : (
                                                <p className="text-sm text-red-600">Error: {result.error}</p>
                                            )}
                                        </div>
                                        {result.success && (
                                            <span className="text-green-500">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
