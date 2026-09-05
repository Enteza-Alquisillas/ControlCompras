'use client'

import { useState } from 'react'

interface Props {
  onConfirm: () => void
  onClose: () => void
  isDeleting: boolean
}

const CONFIRM_PHRASE = 'BORRAR RESERVAS'

export function ResetRentalsConfirmModal({ onConfirm, onClose, isDeleting }: Props) {
  const [input, setInput] = useState('')
  const canConfirm = input.trim() === CONFIRM_PHRASE && !isDeleting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="reset-rentals-title" className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 id="reset-rentals-title" className="text-lg font-semibold text-red-700">Vaciar todas las reservas</h3>
        </div>

        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            Esto borra <strong>todos</strong> los pedidos (<code>rentals</code>) y sus líneas de artículos (<code>rental_items</code>) de ambos almacenes. No afecta a artículos, clientes ni stock.
          </p>
          <p className="text-sm text-red-600 font-medium">
            Esta accion es irreversible: no hay copia de seguridad automatica antes de borrar.
          </p>
          <div>
            <label htmlFor="reset-rentals-confirm-input" className="text-sm text-gray-700 block mb-1">
              Escribe <strong>{CONFIRM_PHRASE}</strong> para confirmar:
            </label>
            <input
              id="reset-rentals-confirm-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
              placeholder={CONFIRM_PHRASE}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Borrando...' : 'Vaciar reservas'}
          </button>
        </div>
      </section>
    </div>
  )
}
