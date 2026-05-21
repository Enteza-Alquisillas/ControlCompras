import { Database } from '@/lib/supabase/database.types'

export type Rental = Database['public']['Tables']['rentals']['Row']
export type RentalItem = Database['public']['Tables']['rental_items']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type Article = Database['public']['Tables']['articles']['Row']

export interface RentalWithCustomer extends Rental {
    customer: Pick<Customer, 'name'> | null
    items?: { article_id: string }[]
}

export interface RentalItemWithArticle extends RentalItem {
    article: Pick<Article, 'code' | 'description' | 'family'> | null
}

export interface ReservationState {
    selectedDate: Date
    selectedRentalId: string | null
    selectedArticleId: string | null
    isDetailModalOpen: boolean
    setSelectedDate: (date: Date) => void
    setSelectedRentalId: (id: string | null) => void
    setSelectedArticleId: (id: string | null) => void
    setDetailModalOpen: (isOpen: boolean) => void
    navigateToRental: (id: string, eventDate: Date) => void
}
