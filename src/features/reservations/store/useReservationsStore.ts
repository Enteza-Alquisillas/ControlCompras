import { create } from 'zustand'
import { ReservationState } from '../types'

export const useReservationsStore = create<ReservationState>((set) => ({
    selectedDate: new Date(),
    selectedRentalId: null,
    isDetailModalOpen: false,
    setSelectedDate: (date) => set({ selectedDate: date }),
    setSelectedRentalId: (id) => set({ selectedRentalId: id }),
    setDetailModalOpen: (isOpen) => set({ isDetailModalOpen: isOpen }),
}))
