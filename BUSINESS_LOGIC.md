# Reglas de Negocio

## Propósito

Enteza alquila material para eventos desde los almacenes de Sevilla y Jerez. El
sistema permite saber qué material queda disponible en una fecha, detectar
roturas de stock y consultar contratos importados del sistema legacy.

## Entidades y fechas

| Término | Definición |
| --- | --- |
| Artículo | Material alquilable identificado por `legacy_id` y código. |
| Stock | Cantidad física del artículo por almacén. |
| Reserva o contrato | Cabecera importada de `EVENTO_ALQUILER`, identificada por `legacy_id`. |
| Línea de reserva | Artículo y cantidad comprometida dentro de un contrato. |
| Fecha de evento | Día principal mostrado en calendario y listados. |
| Fecha de entrega | Inicio del compromiso físico del material. |
| Fecha de recogida | Fin del compromiso físico del material. |

Un contrato se consulta por su número legacy. En la interfaz se denomina
**contrato**, aunque en el sistema origen se llame evento.

## Disponibilidad

Para cada artículo y fecha:

```text
disponible = stock total - suma de líneas comprometidas
```

Una línea está comprometida cuando la fecha consultada pertenece al intervalo
inclusivo `delivery_date..pickup_date` de una reserva no cancelada. La fecha de
evento no sustituye ese intervalo: sirve para ordenar y navegar, no para liberar
material.

Una disponibilidad negativa es una **rotura de stock** o sobreventa. Es una
alerta informativa; no bloquea automáticamente una operación comercial. La
decisión de aceptar, comprar o reorganizar material siempre es humana.

## Almacenes e internos

- Los almacenes operativos son `SEVILLA` y `JEREZ`.
- El catálogo puede compartir un artículo entre ambos mediante el mapeo legacy
  de Jerez a Sevilla.
- Los movimientos internos entre almacenes no son eventos de cliente y se
  excluyen de disponibilidad, analítica y sincronización de reservas.
- Los identificadores internos conocidos son `410000` y `110000`; también se
  excluyen clientes cuyo nombre contiene `ENTEZA`.

## Clientes

`customers.legacy_id` es la identidad de integración con SQL Server. El NIF/CIF
se conserva en `customers.vat`, normalizado sin espacios, puntuación ni prefijo
`ES`.

En Odoo 19 se busca primero por NIF/CIF. Si falta, se busca por nombre exacto.
Una coincidencia ausente o ambigua usa el partner de respaldo `CLIENTES VARIOS`;
no se crean partners automáticamente durante la exportación.

## Fuentes de datos

- SQL Server es el origen operativo del legacy.
- Supabase es el espejo usado por la aplicación, disponibilidad y chat Machu.
- Odoo 19 es el ERP destino de la exportación y fuente del chat Odoo.

La copia de Supabase puede no incluir cambios creados directamente en Odoo 19.
Para datos recientes del ERP se debe consultar la fuente Odoo en el chat.
