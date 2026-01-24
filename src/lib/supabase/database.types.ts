export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      article_stock: {
        Row: {
          article_id: string
          id: string
          quantity: number
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          article_id: string
          id?: string
          quantity?: number
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          article_id?: string
          id?: string
          quantity?: number
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_stock_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          code: string | null
          created_at: string | null
          description: string
          id: string
          is_active: boolean | null
          legacy_id: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          legacy_id?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          legacy_id?: number | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string
          is_internal: boolean | null
          legacy_id: number | null
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean | null
          legacy_id?: number | null
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean | null
          legacy_id?: number | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      rental_items: {
        Row: {
          article_id: string
          id: string
          notes: string | null
          quantity: number
          rental_id: string
        }
        Insert: {
          article_id: string
          id?: string
          notes?: string | null
          quantity: number
          rental_id: string
        }
        Update: {
          article_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          rental_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_items_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_id: string
          delivery_address: string | null
          delivery_date: string
          event_date: string | null
          id: string
          legacy_id: number | null
          notes: string | null
          pickup_date: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          delivery_address?: string | null
          delivery_date: string
          event_date?: string | null
          id?: string
          legacy_id?: number | null
          notes?: string | null
          pickup_date: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          delivery_address?: string | null
          delivery_date?: string
          event_date?: string | null
          id?: string
          legacy_id?: number | null
          notes?: string | null
          pickup_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rentals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_article_reservations: {
        Args: {
          p_article_id: string
          start_date?: string | null
          end_date?: string | null
        }
        Returns: {
          rental_id: string
          customer_name: string
          delivery_date: string
          pickup_date: string
          event_date: string | null
          delivery_address: string | null
          quantity: number
          rental_status: string
        }[]
      }
      get_article_reservations_optimized: {
        Args: {
          p_article_id: string
          start_date?: string | null
          end_date?: string | null
        }
        Returns: {
          reservation_date: string
          rental_id: string
          customer_name: string
          quantity: number
          delivery_date: string
          pickup_date: string
          delivery_address: string | null
          event_date: string
        }[]
      }
      get_stock_breakages: {
        Args: {
          start_date?: string | null
          end_date?: string | null
        }
        Returns: {
          article_id: string
          article_code: string | null
          article_description: string
          breakage_date: string
          total_stock: number
          committed: number
          available: number
          stock_sevilla: number
          stock_jerez: number
        }[]
      }
      get_stock_breakages_optimized: {
        Args: {
          start_date?: string | null
          end_date?: string | null
        }
        Returns: {
          article_id: string
          article_code: string | null
          article_description: string
          breakage_date: string
          total_stock: number
          committed: number
          available: number
          stock_sevilla: number
          stock_jerez: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Functions<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T]

// Convenience types for the app
export type Article = Tables<'articles'>
export type ArticleStock = Tables<'article_stock'>
export type Customer = Tables<'customers'>
export type Rental = Tables<'rentals'>
export type RentalItem = Tables<'rental_items'>
export type Warehouse = Tables<'warehouses'>

// Function return types
export type StockBreakage = Functions<'get_stock_breakages'>['Returns'][number]
export type ArticleReservation = Functions<'get_article_reservations'>['Returns'][number]
