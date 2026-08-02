-- Migration: add_customer_vat
-- RFC from SQL Server is stored as a normalized CIF/NIF for Odoo 19 matching.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_vat
  ON public.customers (vat)
  WHERE vat IS NOT NULL;

COMMENT ON COLUMN public.customers.vat IS
  'CIF/NIF normalizado desde dbo.CLIENTE.RFC. Se usa para enlazar con res.partner.vat en Odoo 19.';
