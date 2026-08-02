'use client'

import { useState } from 'react'
import { useOdoo19Export } from '../hooks/useOdoo19Export'
import { useRentalsForOdoo19Export } from '../hooks/useRentalsForOdoo19Export'
import type { Odoo19RentalForExport } from '../types'

function defaultDates(): { startDate: string; endDate: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const endDay = String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')
  return { startDate: `${year}-${month}-01`, endDate: `${year}-${month}-${endDay}` }
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function destination(rental: Odoo19RentalForExport): string {
  if (rental.warehouse?.code === 'SEVILLA') return 'Visueña'
  if (rental.warehouse?.code === 'JEREZ') return 'Stileum'
  return 'Sin destino'
}

export function Odoo19ExportPage() {
  const defaults = defaultDates()
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const { rentals, isLoading, error, refetch } = useRentalsForOdoo19Export(startDate, endDate)
  const { selectedIds, isExporting, result, setResult, toggle, setSelectedIds, exportSelected, unmark } = useOdoo19Export(refetch)
  const pending = rentals.filter((rental) => rental.odoo19OrderId === null)
  const selected = rentals.filter((rental) => selectedIds.has(rental.id))

  function selectPending(): void {
    setSelectedIds(new Set(pending.map((rental) => rental.id)))
  }

  async function removeMark(rental: Odoo19RentalForExport): Promise<void> {
    if (!window.confirm(`Se quitará la marca del pedido Odoo 19 #${rental.odoo19OrderId}. El pedido no se elimina de Odoo.`)) return
    await unmark(rental)
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Odoo 19 Enterprise</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">Exportar alquileres nativos</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Sevilla se crea en Visueña y Jerez en Stileum. Este flujo es independiente de la exportación a Odoo 15.
          </p>
        </header>

        <section className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white px-6 py-4">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Desde
            <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Hasta
            <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[1fr_18rem]">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Pedidos para Odoo 19</h2>
                <p className="text-xs text-gray-500">Solo se bloquea una reserva ya exportada a Odoo 19.</p>
              </div>
              <button className="text-sm font-medium text-indigo-700 disabled:text-gray-400" onClick={selectPending} disabled={pending.length === 0}>
                Seleccionar pendientes ({pending.length})
              </button>
            </div>

            {isLoading ? <div className="h-48 animate-pulse rounded-lg bg-gray-100" /> : rentals.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500">No hay pedidos en el rango seleccionado.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr><th className="w-10 px-3 py-3" /><th className="px-3 py-3">Evento</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Destino</th><th className="px-3 py-3 text-center">Art.</th><th className="px-3 py-3">Estado Odoo 19</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rentals.map((rental) => {
                      const exported = rental.odoo19OrderId !== null
                      return (
                        <tr key={rental.id} className={exported ? 'bg-emerald-50' : selectedIds.has(rental.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-3 text-center"><input aria-label={`Seleccionar contrato ${rental.legacyId ?? rental.id}`} type="checkbox" checked={selectedIds.has(rental.id)} disabled={exported} onChange={() => toggle(rental.id)} /></td>
                          <td className="px-3 py-3 font-medium text-gray-900">{formatDate(rental.eventDate)}<span className="block text-xs font-normal text-gray-400">#{rental.legacyId ?? '-'}</span></td>
                          <td className="px-3 py-3 text-gray-700">{rental.customer?.name ?? 'Sin cliente'}</td>
                          <td className="px-3 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{destination(rental)}</span></td>
                          <td className="px-3 py-3 text-center text-gray-700">{rental.itemCount}</td>
                          <td className="px-3 py-3">{exported ? <div className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">#{rental.odoo19OrderId} · {rental.odoo19CompanyCode}</span><button className="text-xs text-amber-700 underline" onClick={() => void removeMark(rental)}>Desmarcar</button></div> : <span className="text-xs text-gray-400">Pendiente</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="rounded-xl border border-gray-200 bg-white p-5 xl:sticky xl:top-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Exportar a Odoo 19</h2>
            <p className="mt-2 text-3xl font-bold text-gray-950">{selectedIds.size}</p>
            <p className="text-sm text-gray-500">pedido{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}</p>
            {selected.length > 0 && <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">{selected.map((rental) => <div key={rental.id} className="rounded-lg bg-indigo-50 p-2 text-xs text-indigo-950">{rental.customer?.name ?? 'Sin cliente'}<span className="block text-indigo-700">{destination(rental)} · {rental.itemCount} art.</span></div>)}</div>}
            <button className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300" onClick={() => void exportSelected()} disabled={selectedIds.size === 0 || isExporting}>{isExporting ? 'Exportando...' : 'Crear alquileres en Odoo 19'}</button>
            {selectedIds.size > 0 && <button className="mt-2 w-full px-4 py-2 text-sm text-gray-600" onClick={() => setSelectedIds(new Set())} disabled={isExporting}>Limpiar selección</button>}
          </aside>
        </div>
      </div>

      {result && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="odoo19-result-title" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="border-b px-6 py-4"><h2 id="odoo19-result-title" className="font-semibold text-gray-950">{result.failed === 0 ? 'Exportación a Odoo 19 completada' : 'Resultado de la exportación a Odoo 19'}</h2><p className="mt-1 text-sm text-gray-600">{result.successful} correctos · {result.failed} fallidos</p></div><div className="max-h-80 space-y-2 overflow-y-auto px-6 py-4">{result.results.map((item) => <div key={`${item.rentalId}-${item.rentalLegacyId}`} className={item.success ? 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900' : 'rounded-lg bg-red-50 p-3 text-sm text-red-900'}><strong>{item.rentalLegacyId ? `#${item.rentalLegacyId}` : item.rentalId || 'Solicitud'}</strong> · {item.customerName}<span className="block text-xs">{item.success ? `Pedido Odoo 19 #${item.odooOrderId}` : item.error}</span></div>)}</div><div className="flex justify-end border-t px-6 py-4"><button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white" onClick={() => setResult(null)}>Cerrar</button></div></section></div>}
    </main>
  )
}
