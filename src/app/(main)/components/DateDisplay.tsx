'use client'

import { useState, useEffect } from 'react'

export function DateDisplay() {
    const [date, setDate] = useState<string>('')

    useEffect(() => {
        // Solo renderizar la fecha en el cliente para evitar hydration mismatch
        setDate(
            new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
        )
    }, [])

    if (!date) {
        // Mostrar placeholder mientras se hidrata
        return <span className="text-sm text-gray-500">Cargando...</span>
    }

    return <span className="text-sm text-gray-500">{date}</span>
}
