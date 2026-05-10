'use client'

import type { OdooExportBatchResult } from '../types'

interface ExportResultModalProps {
  result: OdooExportBatchResult
  onClose: () => void
}

export function ExportResultModal({ result, onClose }: ExportResultModalProps) {
  const odooUrl = process.env.NEXT_PUBLIC_ODOO_URL

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 border-b rounded-t-xl ${result.failed === 0 ? 'bg-green-50 border-green-200' : result.successful === 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {result.failed === 0 ? (
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : result.successful === 0 ? (
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              <h2 className="text-lg font-semibold text-gray-900">
                {result.failed === 0 ? 'Exportación completada' : result.successful === 0 ? 'Error en la exportación' : 'Exportación parcial'}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-3 text-sm">
            <span className="text-green-700 font-medium">
              <span className="text-green-800 text-base font-bold">{result.successful}</span> exitosos
            </span>
            {result.failed > 0 && (
              <span className="text-red-700 font-medium">
                <span className="text-red-800 text-base font-bold">{result.failed}</span> fallidos
              </span>
            )}
            <span className="text-gray-500">de {result.total} total</span>
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {result.results.map((r, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg text-sm ${r.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
            >
              {r.success ? (
                <svg className="w-4 h-4 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-red-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {r.rentalLegacyId ? `ENTEZA-${r.rentalLegacyId}` : r.rentalId.slice(0, 8)}
                  {' — '}
                  {r.customerName}
                </div>
                {r.success && r.odooOrderId && odooUrl && (
                  <a
                    href={`${odooUrl}/web#id=${r.odooOrderId}&model=sale.order&view_type=form`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:text-green-900 underline underline-offset-2 mt-0.5 inline-block"
                  >
                    Odoo #{r.odooOrderId} ↗
                  </a>
                )}
                {!r.success && r.error && (
                  <div className="text-red-600 mt-0.5 text-xs break-words">{r.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {result.successful > 0 && odooUrl && (
            <a
              href={`${odooUrl}/web#action=574`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              Ver en Odoo
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
