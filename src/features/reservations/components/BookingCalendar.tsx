'use client'

/**
 * ENTEZA RESERVAS APP - CALENDARIO V3
 * Nota: Esta versión elimina dependencias de objetos en useEffect para estabilidad total.
 */

import { useEffect, useState, useMemo } from 'react'
import { useReservationsStore } from '../store/useReservationsStore'
import { reservationsService } from '../services/reservationsService'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'

export function BookingCalendar() {
    const { selectedDate, setSelectedDate } = useReservationsStore()
    const [indicators, setIndicators] = useState<Record<string, { eventCount: number; hasBreakage: boolean }>>({})
    const [loading, setLoading] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Memorizar parámetros de fecha de forma ESTABLE
    const calendarData = useMemo(() => {
        const mStart = startOfMonth(selectedDate)
        const mEnd = endOfMonth(mStart)
        const sDate = startOfWeek(mStart, { weekStartsOn: 1 })
        const eDate = endOfWeek(mEnd, { weekStartsOn: 1 })

        return {
            monthStart: mStart,
            days: eachDayOfInterval({ start: sDate, end: eDate }),
            // Dependencias para el efecto como strings
            fetchKey: format(mStart, 'yyyy-MM'),
            startStr: format(sDate, 'yyyy-MM-dd'),
            endStr: format(eDate, 'yyyy-MM-dd')
        }
    }, [selectedDate.getMonth(), selectedDate.getFullYear()]) // Solo cambia si cambia el MES

    // Cargar indicadores de forma segura
    useEffect(() => {
        if (!mounted) return

        let isSubscribed = true

        async function loadIndicators() {
            setLoading(true)
            try {
                const data = await reservationsService.getMonthIndicators(calendarData.startStr, calendarData.endStr)
                if (isSubscribed) {
                    setIndicators(data)
                }
            } catch (error) {
                console.error('Error loading calendar indicators:', error)
            } finally {
                if (isSubscribed) setLoading(false)
            }
        }

        loadIndicators()
        return () => { isSubscribed = false }
    }, [calendarData.fetchKey, mounted]) // SOLO se dispara si cambia el MES visible

    if (!mounted) {
        return <div className="bg-[#B5B8D1] p-2 border border-blue-400 rounded shadow-sm w-[300px] h-[315px] animate-pulse" />
    }

    const daysOfWeek = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

    return (
        <div className="bg-[#B5B8D1] p-2 border border-blue-400 rounded shadow-sm w-[300px] select-none shadow-xl">
            {/* Header Selector */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex bg-white px-3 py-1 rounded-md border border-blue-300 min-w-[130px] justify-center shadow-inner">
                    <span className="text-blue-900 font-extrabold uppercase text-[12px] tracking-tight">
                        {format(selectedDate, 'MMMM yyyy', { locale: es })}
                    </span>
                </div>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedDate(subMonths(selectedDate, 1)) }}
                        className="bg-white px-2 py-1 border border-blue-300 rounded hover:bg-gray-100 text-blue-900 font-black shadow-sm active:translate-y-px"
                    >
                        &larr;
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedDate(addMonths(selectedDate, 1)) }}
                        className="bg-white px-2 py-1 border border-blue-300 rounded hover:bg-gray-100 text-blue-900 font-black shadow-sm active:translate-y-px"
                    >
                        &rarr;
                    </button>
                </div>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 text-center mb-1">
                {daysOfWeek.map((day) => (
                    <div key={day} className="text-[9px] font-black text-blue-900/60 uppercase">
                        {day}
                    </div>
                ))}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-7 gap-[1px] bg-blue-300 border border-blue-300 overflow-hidden rounded-md shadow-lg">
                {calendarData.days.map((day, idx) => {
                    const isCurrentMonth = isSameMonth(day, calendarData.monthStart)
                    const isSelected = isSameDay(day, selectedDate)
                    const dateKey = format(day, 'yyyy-MM-dd')
                    const dayData = indicators[dateKey]

                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedDate(day)}
                            className={`
                h-10 flex flex-col items-center justify-center text-xs relative transition-all duration-200
                ${!isCurrentMonth ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-800'}
                ${isSelected ? 'bg-blue-700 text-white font-black z-10 scale-[1.03] shadow-md ring-1 ring-white/50' : 'hover:bg-blue-50'}
              `}
                        >
                            <span className="relative z-10">{format(day, 'd')}</span>

                            {/* FIXED INDICATORS LOGIC */}
                            <div className="absolute bottom-1.5 flex gap-[3px] h-1.5 items-center justify-center w-full z-20">
                                {/* 1. VOLUME INDICATOR: GREEN (<2) or ORANGE (>=2) */}
                                {isCurrentMonth && dayData && dayData.eventCount > 0 && (
                                    <div
                                        className={`w-2 h-2 rounded-full border border-white/60 shadow-sm ${dayData.eventCount < 2 ? 'bg-green-500' : 'bg-orange-500'}`}
                                        title={`${dayData.eventCount} eventos`}
                                    />
                                )}

                                {/* 2. BREAKAGE INDICATOR: RED (Only if over-selling) */}
                                {isCurrentMonth && dayData && dayData.hasBreakage && (
                                    <div
                                        className="w-2 h-2 bg-red-600 rounded-full border border-white/60 shadow-sm animate-pulse"
                                        title="Alerta Sobreventa"
                                    />
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Footer Info */}
            <div className="h-5 mt-1.5 flex justify-between items-center px-1 border-t border-blue-200 pt-1">
                {loading ? (
                    <span className="text-[7px] text-blue-800 font-bold uppercase animate-pulse flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" /> Sincronizando datos...
                    </span>
                ) : (
                    <span className="text-[7px] text-blue-900 font-bold uppercase tracking-widest opacity-80">Enteza Reservas V3.1</span>
                )}
            </div>
        </div>
    )
}
