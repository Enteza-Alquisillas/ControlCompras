-- Migration: add_odoo_fields_to_rentals
-- Adds Odoo integration tracking fields to the rentals table

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS odoo_order_id INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast lookup of exported vs pending rentals
CREATE INDEX IF NOT EXISTS idx_rentals_odoo_order_id
  ON public.rentals (odoo_order_id)
  WHERE odoo_order_id IS NOT NULL;

-- Documentation
COMMENT ON COLUMN public.rentals.odoo_order_id IS 'ID del sale.order en Odoo 15. NULL = no exportado.';
COMMENT ON COLUMN public.rentals.odoo_synced_at IS 'Timestamp de la última exportación exitosa a Odoo.';
