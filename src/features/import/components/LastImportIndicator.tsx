'use client'

import { useEffect, useState } from 'react'
import { getLastImportDates } from '../actions/importActions'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface LastImportData {
  sevilla: string | null
  jerez: string | null
}

export function LastImportIndicator() {
  const [data, setData] = useState<LastImportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await getLastImportDates()
        setData(result)
      } catch (error) {
        console.error('Error fetching last import dates:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  const getLatestImport = () => {
    if (!data) return null
    const dates = [
      data.sevilla ? new Date(data.sevilla) : null,
      data.jerez ? new Date(data.jerez) : null,
    ].filter(Boolean) as Date[]

    if (dates.length === 0) return null
    return new Date(Math.max(...dates.map(d => d.getTime())))
  }

  const latestImport = getLatestImport()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse"></div>
        <span>Cargando...</span>
      </div>
    )
  }

  if (!latestImport) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
        <span>Sin importaciones</span>
      </div>
    )
  }

  const timeAgo = formatDistanceToNow(latestImport, { addSuffix: true, locale: es })
  const isRecent = Date.now() - latestImport.getTime() < 1000 * 60 * 60 * 24 // menos de 24 horas

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-green-500' : 'bg-amber-500'}`}></div>
      <span>
        Sincronizado {timeAgo}
      </span>
    </div>
  )
}
