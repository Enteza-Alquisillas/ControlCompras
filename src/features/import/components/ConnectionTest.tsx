'use client'

import { useState } from 'react'
import { testConnectionAction } from '../actions/importActions'

export function ConnectionTest() {
    const [status, setStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({
        SEVILLA: 'idle',
        JEREZ: 'idle'
    })
    const [errors, setErrors] = useState<Record<string, string | null>>({
        SEVILLA: null,
        JEREZ: null
    })

    const testConnection = async (warehouse: 'SEVILLA' | 'JEREZ') => {
        setStatus(prev => ({ ...prev, [warehouse]: 'testing' }))
        setErrors(prev => ({ ...prev, [warehouse]: null }))

        try {
            const data = await testConnectionAction(warehouse)

            if (data.success) {
                setStatus(prev => ({ ...prev, [warehouse]: 'success' }))
            } else {
                setStatus(prev => ({ ...prev, [warehouse]: 'error' }))
                setErrors(prev => ({ ...prev, [warehouse]: data.error || `Error al conectar con ${warehouse}` }))
            }
        } catch (err) {
            setStatus(prev => ({ ...prev, [warehouse]: 'error' }))
            setErrors(prev => ({ ...prev, [warehouse]: err instanceof Error ? err.message : 'Error desconocido' }))
        }
    }

    return (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Estado de Conexión</h3>
                <p className="text-sm text-gray-500">Verifica la conectividad con los servidores legacy</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['SEVILLA', 'JEREZ'].map((wh) => (
                    <div key={wh} className="border rounded-md p-4 bg-gray-50 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-700">{wh}</span>
                            <button
                                onClick={() => testConnection(wh as any)}
                                disabled={status[wh] === 'testing'}
                                className="px-3 py-1 bg-white border border-gray-300 text-sm rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                {status[wh] === 'testing' ? 'Probando...' : 'Probar'}
                            </button>
                        </div>

                        {status[wh] === 'success' && (
                            <div className="text-xs text-green-700 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Conexión establecida
                            </div>
                        )}

                        {status[wh] === 'error' && (
                            <div className="text-xs text-red-600">
                                {errors[wh]}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
