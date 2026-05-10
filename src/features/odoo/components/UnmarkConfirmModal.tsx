'use client'

import type { RentalForExport } from '../types'

interface UnmarkConfirmModalProps {
  rental: RentalForExport
  isUnmarking: boolean
  onConfirm: () => void
  onCancel: () => void
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

export function UnmarkConfirmModal({ rental, isUnmarking, onConfirm, onCancel }: UnmarkConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!isUnmarking ? onCancel : undefined}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Quitar marca de exportación</h2>
            <p className="text-sm text-amber-700 mt-0.5">
              Esta acción desvincula el pedido de Odoo en Supabase, pero <strong>no elimina</strong> el pedido en Odoo.
            </p>
          </div>
        </div>

        {/* Rental details */}
        <div className="px-6 py-5 space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Contrato</span>
              <span className="font-medium text-gray-900">
                {rental.legacy_id ? `ENTEZA-${rental.legacy_id}` : rental.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente</span>
              <span className="font-medium text-gray-900 text-right max-w-[200px] truncate">
                {rental.customer?.name ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fecha evento</span>
              <span className="font-medium text-gray-900">{formatDate(rental.event_date)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-gray-200">
              <span className="text-gray-500">Pedido Odoo actual</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                #{rental.odoo_order_id}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-500">
            Al confirmar, la reserva quedará como <strong>pendiente</strong> y podrás volver a exportarla generando un nuevo pedido en Odoo.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isUnmarking}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isUnmarking}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isUnmarking ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Quitando marca…
              </>
            ) : (
              'Confirmar'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
