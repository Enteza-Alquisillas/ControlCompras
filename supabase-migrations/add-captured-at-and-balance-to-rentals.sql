-- Migration: add_captured_at_and_balance_to_rentals
-- Datos de cabecera de EVENTO_ALQUILER (SQL Server). Ambas columnas admiten NULL:
-- NULL = el sync aun no ha leido el contrato; 0 es un valor real (pedido sin saldo).

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS captured_at DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12, 2) DEFAULT NULL;

COMMENT ON COLUMN public.rentals.captured_at IS
  'Fecha de captura del pedido (EVENTO_ALQUILER.FECHA_CAPTURA).';
COMMENT ON COLUMN public.rentals.balance_amount IS
  'Importe del pedido segun EVENTO_ALQUILER.SALDO (EXTRAS - ABONOS). Baja cuando hay abonos.';
