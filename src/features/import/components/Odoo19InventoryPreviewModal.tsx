'use client'

import { useEffect, useState } from 'react'
import { previewOdoo19InventoryLoad, applyOdoo19InventoryLoad } from '@/features/odoo19/actions/odoo19InventoryActions'
import type { Odoo19InventoryApplyResult, Odoo19InventoryPreview, Odoo19InventoryStatus } from '@/features/odoo19/types'

interface Props {
  onClose: () => void
}

const STATUS_LABEL: Record<Odoo19InventoryStatus, string> = {
  healthy: 'Actualizar stock',
  to_create: 'Crear producto + stock',
  archived_pending: 'Archivado/no alquilable en Odoo (omitido)',
  manual_review: 'Requiere revisión manual (omitido)',
  not_stockable: 'Sin inventario en Odoo — servicio (omitido)',
}

const APPLICABLE: Odoo19InventoryStatus[] = ['healthy', 'to_create']

export function Odoo19InventoryPreviewModal({ onClose }: Props) {
  const [preview, setPreview] = useState<Odoo19InventoryPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<Odoo19InventoryApplyResult | null>(null)

  async function loadPreview(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setPreview(await previewOdoo19InventoryLoad())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión (comprueba la VPN/intranet para SQL Server)')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPreview()
  }, [])

  async function handleApply(codes?: string[]): Promise<void> {
    setApplying(true)
    try {
      const applyResult = await applyOdoo19InventoryLoad(codes ? { codes } : {})
      setResult(applyResult)
    } catch (err) {
      setResult({
        total: 1,
        successful: 0,
        failed: 1,
        results: [{ code: '', description: '', warehouseCode: 'SEVILLA', quantity: 0, success: false, error: err instanceof Error ? err.message : 'Error desconocido' }],
      })
    } finally {
      setApplying(false)
    }
  }

  const applicableCount = preview?.items.filter((item) => APPLICABLE.includes(item.status)).length ?? 0
  const failedCodes = result?.results.filter((r) => !r.success).map((r) => r.code).filter(Boolean) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="odoo19-inventory-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 id="odoo19-inventory-title" className="font-semibold text-gray-950">Inventario inicial en Odoo 19</h2>
            <p className="mt-1 text-xs text-gray-500">Lee existencias en vivo de SQL Server (Sevilla + Jerez). Requiere VPN/intranet.</p>
          </div>
          <button className="text-sm text-gray-500 hover:text-gray-700" onClick={onClose}>Cerrar</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <div className="h-48 animate-pulse rounded-lg bg-gray-100" />}

          {error && !loading && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">No se pudo generar la previsualización</p>
              <p className="mt-1">{error}</p>
              <button className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700" onClick={() => void loadPreview()}>Reintentar</button>
            </div>
          )}

          {!loading && !error && preview && !result && (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <StatChip label="Sanos" value={preview.totals.healthy} tone="emerald" />
                <StatChip label="A crear" value={preview.totals.toCreate} tone="indigo" />
                <StatChip label="Rev. manual" value={preview.totals.manualReview} tone="amber" />
                <StatChip label="Archivados" value={preview.totals.archivedPending} tone="amber" />
                <StatChip label="Sin stock (serv.)" value={preview.totals.notStockable} tone="gray" />
                <StatChip label="Excluidos" value={preview.totals.excluded} tone="gray" />
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2 text-right">Sevilla</th>
                      <th className="px-3 py-2 text-right">Jerez</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.items.map((item) => (
                      <tr key={item.code} className={APPLICABLE.includes(item.status) ? '' : 'text-gray-400'}>
                        <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.sevillaQty ?? '-'}</td>
                        <td className="px-3 py-2 text-right">{item.jerezQty ?? '-'}</td>
                        <td className="px-3 py-2 text-xs">{STATUS_LABEL[item.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <>
              <p className="mb-3 text-sm text-gray-700">{result.successful} ajustes correctos · {result.failed} fallidos</p>
              <div className="space-y-2">
                {result.results.map((item, idx) => (
                  <div key={`${item.code}-${item.warehouseCode}-${idx}`} className={item.success ? 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900' : 'rounded-lg bg-red-50 p-3 text-sm text-red-900'}>
                    <strong>{item.code || '?'}</strong> · {item.description} · {item.warehouseCode}
                    <span className="block text-xs">{item.success ? `Stock fijado a ${item.quantity}${item.createdProduct ? ' (producto creado)' : ''}` : item.error}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          {result ? (
            <>
              {failedCodes.length > 0 && (
                <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50" disabled={applying} onClick={() => void handleApply(failedCodes)}>
                  {applying ? 'Reintentando...' : `Reintentar ${failedCodes.length} fallidos`}
                </button>
              )}
              <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white" onClick={onClose}>Cerrar</button>
            </>
          ) : (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              disabled={loading || !!error || applicableCount === 0 || applying}
              onClick={() => void handleApply()}
            >
              {applying ? 'Aplicando...' : `Aplicar (${applicableCount} artículos)`}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'indigo' | 'amber' | 'gray' }) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-800',
    indigo: 'bg-indigo-50 text-indigo-800',
    amber: 'bg-amber-50 text-amber-800',
    gray: 'bg-gray-100 text-gray-600',
  }
  return (
    <div className={`rounded-lg p-2 text-center ${toneClasses[tone]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide">{label}</p>
    </div>
  )
}
