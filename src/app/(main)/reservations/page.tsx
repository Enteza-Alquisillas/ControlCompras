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
                <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-baseline gap-3 px-1 h-10">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Calendario Mensual</h3>
                        <span className="text-xl font-black text-blue-900">
                            {format(selectedDate, "dd 'de' MMMM", { locale: es })}
                        </span>
                    </div>
                    <BookingCalendar />
                </div>

                {/* Daily Availability Area */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="h-10 flex items-center px-1">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                            Artículos con Sobreventa
                        </h3>
                    </div>
                    <div className="flex-1 min-h-0">
                        <DailyAvailabilityTable />
                    </div>
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
