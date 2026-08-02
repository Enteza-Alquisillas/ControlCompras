-- Migration: add_odoo19_fields_to_rentals
-- Odoo 15 export tracking remains in odoo_order_id and odoo_synced_at.

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS odoo19_order_id INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo19_synced_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo19_company_code TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_rentals_odoo19_order_id
  ON public.rentals (odoo19_order_id)
  WHERE odoo19_order_id IS NOT NULL;

COMMENT ON COLUMN public.rentals.odoo19_order_id IS
  'ID del sale.order creado en Odoo 19. NULL = no exportado a Odoo 19.';
COMMENT ON COLUMN public.rentals.odoo19_synced_at IS
  'Timestamp de la ultima exportacion correcta a Odoo 19.';
COMMENT ON COLUMN public.rentals.odoo19_company_code IS
  'Compania destino de Odoo 19: VISUENA o STILEUM.';
