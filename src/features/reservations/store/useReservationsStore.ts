import { create } from 'zustand'
import { ReservationState } from '../types'

export const useReservationsStore = create<ReservationState>((set) => ({
    selectedDate: new Date(),
    selectedRentalId: null,
    selectedArticleId: null,
    isDetailModalOpen: false,
    setSelectedDate: (date) => set({ selectedDate: date, selectedArticleId: null }),
    setSelectedRentalId: (id) => set({ selectedRentalId: id }),
    setSelectedArticleId: (id) => set((state) => ({
        selectedArticleId: state.selectedArticleId === id ? null : id
    })),
    setDetailModalOpen: (isOpen) => set({ isDetailModalOpen: isOpen }),
}))
