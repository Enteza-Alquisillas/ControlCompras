'use client'

import { BookingCalendar } from '@/features/reservations/components/BookingCalendar'
import { DailyAvailabilityTable } from '@/features/reservations/components/DailyAvailabilityTable'
import { DailyRentalsTable } from '@/features/reservations/components/DailyRentalsTable'
import { RentalDetailModal } from '@/features/reservations/components/RentalDetailModal'
import { useReservationsStore } from '@/features/reservations/store/useReservationsStore'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function ReservationsPage() {
    const { selectedDate } = useReservationsStore()

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Top Section */}
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                {/* Calendar Area */}
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-1">Calendario Mensual</h3>
                    <BookingCalendar />
                    <div className="mt-auto bg-blue-50 border border-blue-200 p-4 rounded-lg">
                        <p className="text-xs text-blue-800 font-bold uppercase tracking-tighter">Fecha Seleccionada</p>
                        <p className="text-lg font-black text-blue-900 leading-tight">
                            {format(selectedDate, "dd 'de' MMMM", { locale: es })}
                        </p>
                        <p className="text-xs text-blue-600 font-medium">
                            {format(selectedDate, "yyyy")}
                        </p>
                    </div>
                </div>

                {/* Daily Availability Area */}
                <div className="flex-1 flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-1">Artículos con Sobreventa</h3>
                    <DailyAvailabilityTable />
                </div>
            </div>

            {/* Bottom Section - Daily Rentals */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Eventos Programados</h3>
                    <span className="bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                        Vista por event_date
                    </span>
                </div>
                <DailyRentalsTable />
            </div>

            {/* Detail Modal */}
            <RentalDetailModal />
        </div>
    )
}
