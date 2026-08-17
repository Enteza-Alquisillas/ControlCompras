# Especificación Técnica: Módulo Odoo Enterprise 19
# Gestión de Alquiler de Material para Eventos

> Basado en: Enteza Reservas App (Next.js + Supabase)
> Fecha: 2026-02-22
> Versión: 1.0

---

## 1. Resumen Ejecutivo

### Qué es
Módulo de Odoo Enterprise 19 para gestionar el alquiler de material de eventos (sillas, mesas, manteles, vajilla, etc.) con cálculo de disponibilidad en tiempo real.

### Objetivo Principal
Replicar en Odoo la funcionalidad central de la aplicación Enteza Reservas: **detectar roturas de stock futuras** (sobreventa) consultando todas las reservas activas que se solapan en el tiempo para cualquier fecha.

### Pantalla Principal (Dashboard)
Una sola pantalla dividida en 3 zonas:
1. **Superior izquierda**: Widget de calendario mensual con indicadores de color por día
2. **Superior derecha**: Tabla de artículos en sobreventa para el día seleccionado
3. **Inferior**: Tabla de pedidos de alquiler cuyo evento es el día seleccionado

### Stack
- **Backend**: Python 3.11+, Odoo Enterprise 19, PostgreSQL
- **Frontend**: OWL (Odoo Web Library), XML views, SCSS
- **Integración legacy**: SQL Server (Sevilla + Jerez) via sincronización periódica

---

## 2. Nombre y Estructura del Módulo

### Nombre Técnico
```
enteza_rental
```

### Estructura de Carpetas Completa
```
enteza_rental/
├── __init__.py
├── __manifest__.py
│
├── models/
│   ├── __init__.py
│   ├── enteza_warehouse.py         # Almacenes (Sevilla, Jerez)
│   ├── enteza_article.py           # Catálogo de artículos
│   ├── enteza_article_stock.py     # Stock por almacén
│   ├── enteza_rental.py            # Pedido de alquiler (cabecera)
│   ├── enteza_rental_item.py       # Línea de pedido (artículos)
│   └── enteza_availability.py      # Lógica de cálculo (model abstract)
│
├── views/
│   ├── enteza_warehouse_views.xml
│   ├── enteza_article_views.xml
│   ├── enteza_rental_views.xml
│   ├── enteza_dashboard_action.xml # Client action para el dashboard OWL
│   └── enteza_menus.xml
│
├── security/
│   ├── ir.model.access.csv
│   └── enteza_security.xml         # Grupos de acceso
│
├── data/
│   ├── enteza_warehouse_data.xml   # Almacenes iniciales
│   └── enteza_article_family_data.xml
│
├── static/
│   └── src/
│       ├── js/
│       │   ├── dashboard/
│       │   │   ├── EntezaDashboard.js       # Componente raíz OWL
│       │   │   ├── CalendarWidget.js        # Calendario mensual
│       │   │   ├── OverstockPanel.js        # Panel de sobreventa
│       │   │   ├── DailyRentalsTable.js     # Tabla de pedidos del día
│       │   │   └── RentalDetailDialog.js    # Modal de detalle del pedido
│       │   └── enteza_rental.js             # Entry point / registry
│       ├── xml/
│       │   ├── EntezaDashboard.xml          # Templates OWL
│       │   ├── CalendarWidget.xml
│       │   ├── OverstockPanel.xml
│       │   ├── DailyRentalsTable.xml
│       │   └── RentalDetailDialog.xml
│       └── scss/
│           └── enteza_dashboard.scss
│
└── controllers/
    ├── __init__.py
    └── main.py                     # Endpoints JSON-RPC para el dashboard
```

### Manifest (`__manifest__.py`)
```python
{
    'name': 'Enteza - Gestión de Alquiler de Eventos',
    'version': '19.0.1.0.0',
    'category': 'Rental',
    'summary': 'Gestión de alquiler de material para eventos con cálculo de disponibilidad',
    'author': 'Enteza',
    'license': 'OPL-1',
    'depends': [
        'base',
        'mail',
        'web',
    ],
    'data': [
        'security/enteza_security.xml',
        'security/ir.model.access.csv',
        'data/enteza_warehouse_data.xml',
        'views/enteza_warehouse_views.xml',
        'views/enteza_article_views.xml',
        'views/enteza_rental_views.xml',
        'views/enteza_dashboard_action.xml',
        'views/enteza_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'enteza_rental/static/src/scss/enteza_dashboard.scss',
            'enteza_rental/static/src/xml/EntezaDashboard.xml',
            'enteza_rental/static/src/xml/CalendarWidget.xml',
            'enteza_rental/static/src/xml/OverstockPanel.xml',
            'enteza_rental/static/src/xml/DailyRentalsTable.xml',
            'enteza_rental/static/src/xml/RentalDetailDialog.xml',
            'enteza_rental/static/src/js/dashboard/EntezaDashboard.js',
            'enteza_rental/static/src/js/dashboard/CalendarWidget.js',
            'enteza_rental/static/src/js/dashboard/OverstockPanel.js',
            'enteza_rental/static/src/js/dashboard/DailyRentalsTable.js',
            'enteza_rental/static/src/js/dashboard/RentalDetailDialog.js',
            'enteza_rental/static/src/js/enteza_rental.js',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
}
```

---

## 3. Modelos de Datos (Python)

### 3.1 `enteza.warehouse` — Almacenes

```python
# models/enteza_warehouse.py
from odoo import models, fields

class EntezaWarehouse(models.Model):
    _name = 'enteza.warehouse'
    _description = 'Almacén Enteza'
    _order = 'name'

    name = fields.Char('Nombre', required=True)
    code = fields.Char('Código', required=True, size=20)  # 'SEVILLA', 'JEREZ'
    active = fields.Boolean('Activo', default=True)

    # Relaciones
    stock_ids = fields.One2many('enteza.article.stock', 'warehouse_id', 'Stock')

    _sql_constraints = [
        ('code_unique', 'UNIQUE(code)', 'El código de almacén debe ser único'),
    ]
```

### 3.2 `enteza.article` — Catálogo de Artículos

```python
# models/enteza_article.py
from odoo import models, fields, api

class EntezaArticle(models.Model):
    _name = 'enteza.article'
    _description = 'Artículo de Alquiler'
    _order = 'description'

    legacy_id = fields.Integer('ID Legacy (SQL Server)', index=True)
    code = fields.Char('Código', index=True)
    description = fields.Char('Descripción', required=True)
    family = fields.Char('Familia/Clasificación')  # SILLAS, MESAS, VAJILLA, etc.
    active = fields.Boolean('Activo', default=True)

    # Relaciones
    stock_ids = fields.One2many('enteza.article.stock', 'article_id', 'Stock por Almacén')
    rental_item_ids = fields.One2many('enteza.rental.item', 'article_id', 'Líneas de Pedido')

    # Computados
    total_stock = fields.Integer(
        'Stock Total',
        compute='_compute_total_stock',
        store=False
    )

    @api.depends('stock_ids.quantity')
    def _compute_total_stock(self):
        for article in self:
            article.total_stock = sum(article.stock_ids.mapped('quantity'))

    _sql_constraints = [
        ('code_unique', 'UNIQUE(code)', 'El código de artículo debe ser único'),
    ]
```

### 3.3 `enteza.article.stock` — Stock por Almacén

```python
# models/enteza_article_stock.py
from odoo import models, fields

class EntezaArticleStock(models.Model):
    _name = 'enteza.article.stock'
    _description = 'Stock de Artículo por Almacén'

    article_id = fields.Many2one('enteza.article', 'Artículo', required=True, ondelete='cascade')
    warehouse_id = fields.Many2one('enteza.warehouse', 'Almacén', required=True, ondelete='restrict')
    quantity = fields.Integer('Cantidad', default=0)
    updated_at = fields.Datetime('Última Actualización', default=fields.Datetime.now)

    _sql_constraints = [
        ('article_warehouse_unique', 'UNIQUE(article_id, warehouse_id)',
         'Solo puede existir un registro de stock por artículo y almacén'),
    ]
```

### 3.4 `enteza.rental` — Pedido de Alquiler

Este es el modelo central. Contiene las **tres fechas clave** del negocio:

```python
# models/enteza_rental.py
from odoo import models, fields, api
from odoo.exceptions import ValidationError

class EntezaRental(models.Model):
    _name = 'enteza.rental'
    _description = 'Pedido de Alquiler'
    _order = 'event_date desc, id desc'
    _inherit = ['mail.thread', 'mail.activity.mixin']  # Para chatter/notas

    # Identificación
    name = fields.Char('Referencia', required=True, copy=False,
                       default=lambda self: self.env['ir.sequence'].next_by_code('enteza.rental'))
    legacy_id = fields.Integer('Nº Pedido Legacy', index=True)

    # Cliente
    # DECISIÓN: usamos res.partner de Odoo para aprovechar toda la infraestructura
    # El campo is_internal se añade vía herencia o como campo custom en res.partner
    partner_id = fields.Many2one('res.partner', 'Cliente', required=True, index=True)

    # Las TRES fechas clave del negocio
    delivery_date = fields.Date(
        'Fecha de Entrega',
        required=True,
        help="Cuando el material SALE del almacén hacia el cliente. "
             "El stock queda comprometido DESDE este día."
    )
    event_date = fields.Date(
        'Fecha del Evento',
        required=True,
        index=True,
        help="Día del evento del cliente. Fecha pivot para filtrar en la UI."
    )
    pickup_date = fields.Date(
        'Fecha de Recogida',
        required=True,
        help="Cuando el material VUELVE al almacén. "
             "El stock queda comprometido HASTA este día."
    )

    # Logística
    delivery_address = fields.Char('Lugar de Entrega/Evento')
    notes = fields.Text('Notas')

    # Estado
    status = fields.Selection([
        ('confirmed', 'Confirmado'),
        ('delivered', 'Entregado'),
        ('completed', 'Completado'),
        ('cancelled', 'Cancelado'),
    ], string='Estado', default='confirmed', required=True,
       tracking=True)  # tracking=True para log en chatter

    # Líneas
    item_ids = fields.One2many('enteza.rental.item', 'rental_id', 'Artículos')

    # Campos computados
    item_count = fields.Integer('Nº Artículos', compute='_compute_item_count')

    @api.depends('item_ids')
    def _compute_item_count(self):
        for rental in self:
            rental.item_count = len(rental.item_ids)

    @api.constrains('delivery_date', 'event_date', 'pickup_date')
    def _check_dates(self):
        for rental in self:
            if rental.delivery_date > rental.event_date:
                raise ValidationError(
                    "La fecha de entrega no puede ser posterior a la fecha del evento."
                )
            if rental.event_date > rental.pickup_date:
                raise ValidationError(
                    "La fecha del evento no puede ser posterior a la fecha de recogida."
                )
```

### 3.5 `enteza.rental.item` — Línea de Pedido

```python
# models/enteza_rental_item.py
from odoo import models, fields

class EntezaRentalItem(models.Model):
    _name = 'enteza.rental.item'
    _description = 'Línea de Artículo en Pedido'
    _order = 'article_id'

    rental_id = fields.Many2one('enteza.rental', 'Pedido', required=True, ondelete='cascade')
    article_id = fields.Many2one('enteza.article', 'Artículo', required=True)
    quantity = fields.Integer('Cantidad', required=True, default=1)
    notes = fields.Char('Notas')

    # Relacionados (para mostrar en vistas sin join extra)
    article_code = fields.Char(related='article_id.code', string='Código', store=True)
    article_family = fields.Char(related='article_id.family', string='Familia', store=True)
```

### 3.6 `enteza.availability` — Lógica de Disponibilidad (AbstractModel)

```python
# models/enteza_availability.py
# Ver Sección 4 para el código completo
```

### 3.7 Extensión de `res.partner` para clientes internos

```python
# models/enteza_rental.py (o archivo separado res_partner.py)
class ResPartner(models.Model):
    _inherit = 'res.partner'

    is_enteza_internal = fields.Boolean(
        'Cliente Interno (Préstamo entre almacenes)',
        default=False,
        help="Marcar si es un movimiento interno entre almacenes. "
             "No cuenta para el cálculo de disponibilidad."
    )
    enteza_legacy_id = fields.Integer('ID Legacy Enteza', index=True)
```

---

## 4. Lógica de Disponibilidad en Python

### 4.1 Método Principal: Roturas de Stock

```python
# models/enteza_availability.py
from odoo import models, api
from datetime import date, timedelta

class EntezaAvailability(models.AbstractModel):
    """
    Modelo abstracto con la lógica central de cálculo de disponibilidad.
    Usar como mixin o llamar directamente:
        self.env['enteza.availability'].get_stock_breakages('2026-10-24')
    """
    _name = 'enteza.availability'
    _description = 'Lógica de Disponibilidad de Artículos'

    @api.model
    def get_stock_breakages(self, start_date, end_date=None):
        """
        Calcula artículos en sobreventa para un rango de fechas.

        La lógica:
        - El stock queda comprometido durante el RANGO delivery_date → pickup_date
        - La UI pivota sobre event_date (cuándo es el evento del cliente)
        - Solo se evalúan días que tienen eventos reales (no todos los días del año)
        - Se excluyen clientes internos (préstamos entre almacenes)
        - Solo retorna artículos con available < 0 (en sobreventa)

        Args:
            start_date (str|date): Fecha inicio del rango a consultar
            end_date (str|date): Fecha fin. Si es None, usa start_date (un solo día)

        Returns:
            list[dict]: Lista de artículos en sobreventa con sus métricas
        """
        if end_date is None:
            end_date = start_date

        query = """
            WITH article_stock_summary AS (
                -- Stock total por artículo, desglosado por almacén
                SELECT
                    a.id,
                    a.code,
                    a.description,
                    a.family,
                    COALESCE(SUM(ast.quantity), 0) AS total_stock,
                    COALESCE(SUM(CASE WHEN w.code = 'SEVILLA' THEN ast.quantity ELSE 0 END), 0) AS stock_sevilla,
                    COALESCE(SUM(CASE WHEN w.code = 'JEREZ'   THEN ast.quantity ELSE 0 END), 0) AS stock_jerez
                FROM enteza_article a
                LEFT JOIN enteza_article_stock ast ON ast.article_id = a.id
                LEFT JOIN enteza_warehouse w ON w.id = ast.warehouse_id
                WHERE a.active = TRUE
                GROUP BY a.id, a.code, a.description, a.family
            ),
            event_dates AS (
                -- Solo días con eventos reales (event_date en el rango consultado)
                -- Excluir clientes internos
                SELECT DISTINCT
                    ri.article_id,
                    r.event_date,
                    SUM(ri.quantity) OVER (
                        PARTITION BY ri.article_id, r.event_date
                    ) AS event_day_qty
                FROM enteza_rental r
                JOIN enteza_rental_item ri ON ri.rental_id = r.id
                JOIN res_partner p ON p.id = r.partner_id
                    AND (p.is_enteza_internal IS NULL OR p.is_enteza_internal = FALSE)
                WHERE r.event_date BETWEEN %(start_date)s AND %(end_date)s
                  AND r.status != 'cancelled'
            ),
            commitments_on_event AS (
                -- Para cada fecha de evento, el TOTAL comprometido ese día
                -- Un pedido compromete stock durante delivery_date..pickup_date
                -- Si el evento cae en ese rango, ese pedido cuenta
                SELECT
                    ed.article_id,
                    ed.event_date,
                    ed.event_day_qty,
                    SUM(ri.quantity) AS committed_qty
                FROM event_dates ed
                JOIN enteza_rental r
                    ON r.delivery_date <= ed.event_date
                    AND r.pickup_date  >= ed.event_date
                    AND r.status != 'cancelled'
                JOIN enteza_rental_item ri
                    ON ri.rental_id = r.id
                    AND ri.article_id = ed.article_id
                JOIN res_partner p
                    ON p.id = r.partner_id
                    AND (p.is_enteza_internal IS NULL OR p.is_enteza_internal = FALSE)
                GROUP BY ed.article_id, ed.event_date, ed.event_day_qty
            )
            SELECT
                ass.id            AS article_id,
                ass.code          AS article_code,
                ass.description   AS article_description,
                ass.family        AS article_family,
                coe.event_date    AS breakage_date,
                ass.total_stock,
                coe.committed_qty AS committed,
                (ass.total_stock - coe.committed_qty) AS available,
                coe.event_day_qty AS event_day_committed,
                ass.stock_sevilla,
                ass.stock_jerez
            FROM article_stock_summary ass
            JOIN commitments_on_event coe ON coe.article_id = ass.id
            WHERE (ass.total_stock - coe.committed_qty) < 0
            ORDER BY coe.event_date, ass.description
        """

        self.env.cr.execute(query, {
            'start_date': str(start_date),
            'end_date': str(end_date),
        })

        columns = [col.name for col in self.env.cr.description]
        return [dict(zip(columns, row)) for row in self.env.cr.fetchall()]

    @api.model
    def get_month_indicators(self, start_date, end_date):
        """
        Obtiene indicadores por día para el calendario mensual.

        Para cada día devuelve:
        - event_count: cuántos pedidos tienen event_date ese día
        - has_breakage: si existe algún artículo en sobreventa ese día

        Args:
            start_date (str): Primer día del calendario (puede ser lunes anterior al mes)
            end_date (str): Último día del calendario (puede ser domingo posterior al mes)

        Returns:
            dict: { 'YYYY-MM-DD': { 'event_count': int, 'has_breakage': bool }, ... }
        """
        # 1. Conteo de eventos por event_date
        self.env.cr.execute("""
            SELECT event_date, COUNT(*) AS event_count
            FROM enteza_rental r
            JOIN res_partner p ON p.id = r.partner_id
            WHERE r.event_date BETWEEN %(start)s AND %(end)s
              AND r.status != 'cancelled'
              AND (p.is_enteza_internal IS NULL OR p.is_enteza_internal = FALSE)
            GROUP BY event_date
        """, {'start': str(start_date), 'end': str(end_date)})

        indicators = {}
        for row in self.env.cr.fetchall():
            date_str = str(row[0])
            indicators[date_str] = {'event_count': row[1], 'has_breakage': False}

        # 2. Roturas de stock en el rango
        breakages = self.get_stock_breakages(start_date, end_date)
        for b in breakages:
            date_str = str(b['breakage_date'])
            if date_str not in indicators:
                indicators[date_str] = {'event_count': 0, 'has_breakage': False}
            indicators[date_str]['has_breakage'] = True

        return indicators

    @api.model
    def get_rentals_by_event_date(self, event_date):
        """
        Obtiene todos los pedidos cuyo event_date = la fecha dada.

        Returns:
            list[dict]: Lista de pedidos con datos de cabecera
        """
        rentals = self.env['enteza.rental'].search([
            ('event_date', '=', event_date),
            ('status', '!=', 'cancelled'),
            ('partner_id.is_enteza_internal', '!=', True),
        ], order='legacy_id asc')

        result = []
        for r in rentals:
            result.append({
                'id': r.id,
                'name': r.name,
                'legacy_id': r.legacy_id,
                'partner_name': r.partner_id.name,
                'delivery_date': str(r.delivery_date) if r.delivery_date else None,
                'event_date': str(r.event_date) if r.event_date else None,
                'pickup_date': str(r.pickup_date) if r.pickup_date else None,
                'delivery_address': r.delivery_address or '',
                'notes': r.notes or '',
                'item_count': r.item_count,
            })
        return result

    @api.model
    def get_rental_detail(self, rental_id):
        """
        Obtiene la ficha completa de un pedido (cabecera + líneas agrupadas por familia).
        """
        rental = self.env['enteza.rental'].browse(rental_id)
        if not rental.exists():
            return None

        items_by_family = {}
        for item in rental.item_ids.sorted(key=lambda i: (i.article_family or '', i.article_id.description)):
            family = item.article_id.family or 'SIN FAMILIA'
            if family not in items_by_family:
                items_by_family[family] = []
            items_by_family[family].append({
                'id': item.id,
                'article_id': item.article_id.id,
                'article_code': item.article_id.code or '',
                'article_description': item.article_id.description,
                'article_family': family,
                'quantity': item.quantity,
                'notes': item.notes or '',
            })

        return {
            'id': rental.id,
            'name': rental.name,
            'legacy_id': rental.legacy_id,
            'partner_name': rental.partner_id.name,
            'delivery_date': str(rental.delivery_date) if rental.delivery_date else None,
            'event_date': str(rental.event_date) if rental.event_date else None,
            'pickup_date': str(rental.pickup_date) if rental.pickup_date else None,
            'delivery_address': rental.delivery_address or '',
            'notes': rental.notes or '',
            'status': rental.status,
            'items_by_family': items_by_family,
        }
```

---

## 5. Controlador JSON-RPC

```python
# controllers/main.py
from odoo import http
from odoo.http import request
import json

class EntezaRentalController(http.Controller):

    @http.route('/enteza_rental/get_month_indicators', type='json', auth='user')
    def get_month_indicators(self, start_date, end_date):
        return request.env['enteza.availability'].get_month_indicators(start_date, end_date)

    @http.route('/enteza_rental/get_stock_breakages', type='json', auth='user')
    def get_stock_breakages(self, start_date, end_date=None):
        return request.env['enteza.availability'].get_stock_breakages(start_date, end_date)

    @http.route('/enteza_rental/get_rentals_by_date', type='json', auth='user')
    def get_rentals_by_date(self, event_date):
        return request.env['enteza.availability'].get_rentals_by_event_date(event_date)

    @http.route('/enteza_rental/get_rental_detail', type='json', auth='user')
    def get_rental_detail(self, rental_id):
        return request.env['enteza.availability'].get_rental_detail(rental_id)
```

---

## 6. Vistas XML

### 6.1 Vista de Lista de Pedidos

```xml
<!-- views/enteza_rental_views.xml -->
<odoo>
  <!-- ======= RENTAL: TREE VIEW ======= -->
  <record id="enteza_rental_tree" model="ir.ui.view">
    <field name="name">enteza.rental.tree</field>
    <field name="model">enteza.rental</field>
    <field name="arch" type="xml">
      <tree string="Pedidos de Alquiler" decoration-muted="status == 'cancelled'">
        <field name="legacy_id" string="Nº Pedido" optional="show"/>
        <field name="name" string="Referencia"/>
        <field name="partner_id" string="Cliente"/>
        <field name="delivery_date" string="Entrega"/>
        <field name="event_date" string="Evento" decoration-bf="1"/>
        <field name="pickup_date" string="Recogida"/>
        <field name="delivery_address" string="Lugar"/>
        <field name="status" widget="badge"
               decoration-success="status == 'completed'"
               decoration-warning="status == 'delivered'"
               decoration-danger="status == 'cancelled'"/>
        <field name="item_count" string="Artículos"/>
      </tree>
    </field>
  </record>

  <!-- ======= RENTAL: FORM VIEW ======= -->
  <record id="enteza_rental_form" model="ir.ui.view">
    <field name="name">enteza.rental.form</field>
    <field name="model">enteza.rental</field>
    <field name="arch" type="xml">
      <form string="Pedido de Alquiler">
        <header>
          <field name="status" widget="statusbar"
                 statusbar_visible="confirmed,delivered,completed"/>
          <button name="action_cancel" string="Cancelar" type="object"
                  attrs="{'invisible': [('status', '=', 'cancelled')]}"
                  confirm="¿Confirmar cancelación del pedido?"/>
        </header>
        <sheet>
          <div class="oe_title">
            <h1>
              <field name="name" readonly="1"/>
            </h1>
            <h2>
              <field name="legacy_id" string="Nº Legacy"/>
            </h2>
          </div>
          <group>
            <group string="Cliente y Evento">
              <field name="partner_id" options="{'no_create': True}"/>
              <field name="delivery_address"/>
            </group>
            <group string="Fechas">
              <field name="delivery_date"/>
              <field name="event_date"/>
              <field name="pickup_date"/>
            </group>
          </group>
          <notebook>
            <page string="Artículos" name="items">
              <field name="item_ids">
                <tree editable="bottom">
                  <field name="article_id"/>
                  <field name="article_code" readonly="1"/>
                  <field name="article_family" readonly="1"/>
                  <field name="quantity"/>
                  <field name="notes"/>
                </tree>
              </field>
            </page>
            <page string="Notas" name="notes">
              <field name="notes" placeholder="Notas internas..."/>
            </page>
          </notebook>
        </sheet>
        <div class="oe_chatter">
          <field name="message_follower_ids"/>
          <field name="activity_ids"/>
          <field name="message_ids"/>
        </div>
      </form>
    </field>
  </record>

  <!-- ======= RENTAL: SEARCH VIEW ======= -->
  <record id="enteza_rental_search" model="ir.ui.view">
    <field name="name">enteza.rental.search</field>
    <field name="model">enteza.rental</field>
    <field name="arch" type="xml">
      <search>
        <field name="partner_id"/>
        <field name="legacy_id" string="Nº Pedido"/>
        <field name="delivery_address" string="Lugar"/>
        <filter name="confirmed" string="Confirmados"
                domain="[('status', '=', 'confirmed')]"/>
        <filter name="this_month" string="Este mes"
                domain="[('event_date', '&gt;=', (context_today()).strftime('%%Y-%%m-01'))]"/>
        <group expand="0" string="Agrupar por">
          <filter name="group_partner" string="Cliente"
                  context="{'group_by': 'partner_id'}"/>
          <filter name="group_event_date" string="Fecha Evento"
                  context="{'group_by': 'event_date'}"/>
        </group>
      </search>
    </field>
  </record>

  <!-- ======= RENTAL: ACTION ======= -->
  <record id="enteza_rental_action" model="ir.actions.act_window">
    <field name="name">Pedidos de Alquiler</field>
    <field name="res_model">enteza.rental</field>
    <field name="view_mode">tree,form</field>
    <field name="context">{}</field>
  </record>

  <!-- ======= ARTICLE: TREE ======= -->
  <record id="enteza_article_tree" model="ir.ui.view">
    <field name="name">enteza.article.tree</field>
    <field name="model">enteza.article</field>
    <field name="arch" type="xml">
      <tree string="Artículos">
        <field name="code"/>
        <field name="description"/>
        <field name="family"/>
        <field name="total_stock" string="Stock Total"/>
        <field name="active" widget="boolean_toggle"/>
      </tree>
    </field>
  </record>

  <record id="enteza_article_action" model="ir.actions.act_window">
    <field name="name">Artículos</field>
    <field name="res_model">enteza.article</field>
    <field name="view_mode">tree,form</field>
  </record>
</odoo>
```

### 6.2 Client Action para el Dashboard OWL

```xml
<!-- views/enteza_dashboard_action.xml -->
<odoo>
  <record id="enteza_dashboard_action" model="ir.actions.client">
    <field name="name">Dashboard de Disponibilidad</field>
    <field name="tag">enteza_rental.Dashboard</field>
  </record>
</odoo>
```

### 6.3 Menús

```xml
<!-- views/enteza_menus.xml -->
<odoo>
  <!-- Menú principal -->
  <menuitem id="enteza_rental_menu_root"
            name="Enteza Alquiler"
            sequence="50"
            web_icon="enteza_rental,static/src/img/icon.png"/>

  <!-- Dashboard (primer elemento del menú) -->
  <menuitem id="enteza_rental_menu_dashboard"
            name="Disponibilidad"
            parent="enteza_rental_menu_root"
            action="enteza_dashboard_action"
            sequence="10"/>

  <!-- Pedidos -->
  <menuitem id="enteza_rental_menu_rentals"
            name="Pedidos"
            parent="enteza_rental_menu_root"
            action="enteza_rental_action"
            sequence="20"/>

  <!-- Artículos -->
  <menuitem id="enteza_rental_menu_articles"
            name="Artículos"
            parent="enteza_rental_menu_root"
            action="enteza_article_action"
            sequence="30"/>

  <!-- Configuración -->
  <menuitem id="enteza_rental_menu_config"
            name="Configuración"
            parent="enteza_rental_menu_root"
            sequence="90"/>

  <menuitem id="enteza_rental_menu_warehouses"
            name="Almacenes"
            parent="enteza_rental_menu_config"
            action="enteza_warehouse_action"
            sequence="10"/>
</odoo>
```

---

## 7. Componentes OWL del Dashboard

### 7.1 Componente Raíz: `EntezaDashboard`

```javascript
// static/src/js/dashboard/EntezaDashboard.js
/** @odoo-module **/

import { Component, useState, onMounted } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { CalendarWidget } from "./CalendarWidget";
import { OverstockPanel } from "./OverstockPanel";
import { DailyRentalsTable } from "./DailyRentalsTable";
import { RentalDetailDialog } from "./RentalDetailDialog";

export class EntezaDashboard extends Component {
    static template = "enteza_rental.Dashboard";
    static components = {
        CalendarWidget,
        OverstockPanel,
        DailyRentalsTable,
        RentalDetailDialog,
    };

    setup() {
        this.rpc = useService("rpc");

        // Estado global del dashboard
        this.state = useState({
            selectedDate: new Date(),          // Fecha seleccionada en el calendario
            breakages: [],                      // Artículos en sobreventa del día
            rentals: [],                        // Pedidos del día
            selectedArticleId: null,            // Artículo seleccionado en panel de sobreventa
            selectedRentalId: null,             // Pedido seleccionado para el modal
            isDetailOpen: false,                // Modal de detalle abierto
            loadingBreakages: false,
            loadingRentals: false,
        });

        // Cargar datos al montar
        onMounted(() => {
            this._loadDayData(this.state.selectedDate);
        });
    }

    /**
     * Llamado por CalendarWidget cuando el usuario hace clic en un día.
     */
    onDateSelected(date) {
        this.state.selectedDate = date;
        this.state.selectedArticleId = null;  // Reset selección de artículo
        this._loadDayData(date);
    }

    /**
     * Llamado por OverstockPanel cuando se hace clic en un artículo en sobreventa.
     */
    onArticleSelected(articleId) {
        this.state.selectedArticleId =
            this.state.selectedArticleId === articleId ? null : articleId;
    }

    /**
     * Llamado por DailyRentalsTable cuando se hace clic en un pedido.
     */
    onRentalSelected(rentalId) {
        this.state.selectedRentalId = rentalId;
        this.state.isDetailOpen = true;
    }

    closeDetail() {
        this.state.isDetailOpen = false;
        this.state.selectedRentalId = null;
    }

    /**
     * Carga los datos del día seleccionado: sobreventa + pedidos.
     * Las dos llamadas se lanzan en paralelo.
     */
    async _loadDayData(date) {
        const dateStr = this._formatDate(date);

        this.state.loadingBreakages = true;
        this.state.loadingRentals = true;

        const [breakages, rentals] = await Promise.all([
            this.rpc("/enteza_rental/get_stock_breakages", {
                start_date: dateStr,
                end_date: dateStr,
            }).catch(() => []),
            this.rpc("/enteza_rental/get_rentals_by_date", {
                event_date: dateStr,
            }).catch(() => []),
        ]);

        this.state.breakages = breakages;
        this.state.rentals = rentals;
        this.state.loadingBreakages = false;
        this.state.loadingRentals = false;
    }

    _formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
}
```

### 7.2 Template OWL del Dashboard

```xml
<!-- static/src/xml/EntezaDashboard.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">

  <t t-name="enteza_rental.Dashboard">
    <div class="enteza-dashboard d-flex flex-column h-100 p-3 bg-light gap-3">

      <!-- ZONA SUPERIOR: Calendario + Panel de Sobreventa -->
      <div class="d-flex gap-3 align-items-start">

        <!-- Calendario (izquierda) -->
        <CalendarWidget
          selectedDate="state.selectedDate"
          onDateSelected.bind="onDateSelected"
        />

        <!-- Panel de Sobreventa (derecha, crece) -->
        <OverstockPanel
          breakages="state.breakages"
          loading="state.loadingBreakages"
          selectedDate="state.selectedDate"
          selectedArticleId="state.selectedArticleId"
          onArticleSelected.bind="onArticleSelected"
          class="flex-grow-1"
        />
      </div>

      <!-- ZONA INFERIOR: Tabla de Pedidos del Día -->
      <DailyRentalsTable
        rentals="state.rentals"
        loading="state.loadingRentals"
        selectedDate="state.selectedDate"
        selectedArticleId="state.selectedArticleId"
        onRentalSelected.bind="onRentalSelected"
        class="flex-grow-1"
      />

      <!-- Modal de Detalle de Pedido -->
      <RentalDetailDialog
        t-if="state.isDetailOpen"
        rentalId="state.selectedRentalId"
        onClose.bind="closeDetail"
      />
    </div>
  </t>

</templates>
```

### 7.3 Componente CalendarWidget

```javascript
// static/src/js/dashboard/CalendarWidget.js
/** @odoo-module **/

import { Component, useState, onWillUpdateProps, onMounted } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class CalendarWidget extends Component {
    static template = "enteza_rental.CalendarWidget";
    static props = {
        selectedDate: Date,
        onDateSelected: Function,
    };

    setup() {
        this.rpc = useService("rpc");

        this.state = useState({
            viewMonth: new Date(this.props.selectedDate),  // Mes visualizado
            indicators: {},      // { 'YYYY-MM-DD': { event_count, has_breakage } }
            loading: false,
        });

        onMounted(() => this._loadIndicators());
    }

    /**
     * Navega al mes anterior.
     */
    prevMonth() {
        const d = new Date(this.state.viewMonth);
        d.setMonth(d.getMonth() - 1);
        this.state.viewMonth = d;
        this._loadIndicators();
    }

    /**
     * Navega al mes siguiente.
     */
    nextMonth() {
        const d = new Date(this.state.viewMonth);
        d.setMonth(d.getMonth() + 1);
        this.state.viewMonth = d;
        this._loadIndicators();
    }

    /**
     * Retorna los días a renderizar en la grilla del calendario.
     * Incluye días del mes anterior y siguiente para completar semanas.
     * La semana empieza en LUNES.
     */
    get calendarDays() {
        const month = this.state.viewMonth;
        const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
        const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);

        // Retroceder hasta el lunes anterior al primer día
        const start = new Date(firstDay);
        const dayOfWeek = (start.getDay() + 6) % 7; // 0=Lun, 6=Dom
        start.setDate(start.getDate() - dayOfWeek);

        // Avanzar hasta el domingo posterior al último día
        const end = new Date(lastDay);
        const endDow = (end.getDay() + 6) % 7;
        end.setDate(end.getDate() + (6 - endDow));

        const days = [];
        const current = new Date(start);
        while (current <= end) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return days;
    }

    get monthLabel() {
        return this.state.viewMonth.toLocaleDateString('es-ES', {
            month: 'long', year: 'numeric'
        });
    }

    isSameMonth(date) {
        return date.getMonth() === this.state.viewMonth.getMonth() &&
               date.getFullYear() === this.state.viewMonth.getFullYear();
    }

    isSelected(date) {
        const s = this.props.selectedDate;
        return date.getDate() === s.getDate() &&
               date.getMonth() === s.getMonth() &&
               date.getFullYear() === s.getFullYear();
    }

    getIndicator(date) {
        const key = this._fmt(date);
        return this.state.indicators[key] || null;
    }

    onDayClick(date) {
        this.props.onDateSelected(date);
    }

    async _loadIndicators() {
        const days = this.calendarDays;
        if (!days.length) return;

        const startDate = this._fmt(days[0]);
        const endDate = this._fmt(days[days.length - 1]);

        this.state.loading = true;
        try {
            const data = await this.rpc("/enteza_rental/get_month_indicators", {
                start_date: startDate,
                end_date: endDate,
            });
            this.state.indicators = data || {};
        } catch (e) {
            console.error("Error cargando indicadores de calendario:", e);
        } finally {
            this.state.loading = false;
        }
    }

    _fmt(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
}
```

### 7.4 Template del Calendario

```xml
<!-- static/src/xml/CalendarWidget.xml -->
<templates xml:space="preserve">
  <t t-name="enteza_rental.CalendarWidget">
    <div class="enteza-calendar card shadow-sm" style="width: 280px; min-width: 280px;">

      <!-- Header con navegación de mes -->
      <div class="card-header d-flex justify-content-between align-items-center py-2 bg-primary text-white">
        <button class="btn btn-sm btn-outline-light py-0" t-on-click="prevMonth">←</button>
        <strong class="text-capitalize" t-esc="monthLabel"/>
        <button class="btn btn-sm btn-outline-light py-0" t-on-click="nextMonth">→</button>
      </div>

      <div class="card-body p-1">
        <!-- Cabecera días de la semana -->
        <div class="d-grid enteza-cal-grid mb-1">
          <t t-foreach="['Lu','Ma','Mi','Ju','Vi','Sa','Do']" t-as="dow" t-key="dow">
            <div class="text-center text-muted small fw-bold" t-esc="dow"/>
          </t>
        </div>

        <!-- Grilla de días -->
        <div class="d-grid enteza-cal-grid">
          <t t-foreach="calendarDays" t-as="day" t-key="day.toISOString()">
            <t t-set="ind" t-value="getIndicator(day)"/>
            <button
              class="enteza-cal-day btn btn-sm p-0 position-relative"
              t-att-class="{
                'text-muted': !isSameMonth(day),
                'bg-primary text-white fw-bold': isSelected(day),
                'btn-light': !isSelected(day)
              }"
              t-on-click="() => this.onDayClick(day)"
            >
              <span t-esc="day.getDate()"/>
              <!-- Indicadores de punto -->
              <span class="enteza-cal-indicators position-absolute bottom-0 start-50 translate-middle-x d-flex gap-1 pb-1">
                <t t-if="ind and ind.event_count > 0">
                  <span class="enteza-dot"
                        t-att-class="ind.event_count >= 2 ? 'bg-warning' : 'bg-success'"
                        t-att-title="ind.event_count + ' eventos'"/>
                </t>
                <t t-if="ind and ind.has_breakage">
                  <span class="enteza-dot bg-danger" title="¡Sobreventa!"/>
                </t>
              </span>
            </button>
          </t>
        </div>
      </div>

      <!-- Leyenda -->
      <div class="card-footer py-1 px-2 d-flex gap-3 justify-content-center small">
        <span><span class="enteza-dot bg-success me-1"/>1 evento</span>
        <span><span class="enteza-dot bg-warning me-1"/>2+ eventos</span>
        <span><span class="enteza-dot bg-danger me-1"/>Sobreventa</span>
      </div>
    </div>
  </t>
</templates>
```

---

## 8. Seguridad

### `security/enteza_security.xml`

```xml
<odoo>
  <!-- Grupos de acceso -->
  <record id="group_enteza_user" model="res.groups">
    <field name="name">Enteza / Usuario</field>
    <field name="category_id" ref="base.module_category_rental"/>
    <field name="implied_ids" eval="[(4, ref('base.group_user'))]"/>
  </record>

  <record id="group_enteza_manager" model="res.groups">
    <field name="name">Enteza / Responsable</field>
    <field name="category_id" ref="base.module_category_rental"/>
    <field name="implied_ids" eval="[(4, ref('group_enteza_user'))]"/>
  </record>
</odoo>
```

### `security/ir.model.access.csv`

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_enteza_warehouse_user,enteza.warehouse user,model_enteza_warehouse,group_enteza_user,1,0,0,0
access_enteza_warehouse_manager,enteza.warehouse manager,model_enteza_warehouse,group_enteza_manager,1,1,1,1
access_enteza_article_user,enteza.article user,model_enteza_article,group_enteza_user,1,0,0,0
access_enteza_article_manager,enteza.article manager,model_enteza_article,group_enteza_manager,1,1,1,1
access_enteza_article_stock_user,enteza.article.stock user,model_enteza_article_stock,group_enteza_user,1,0,0,0
access_enteza_article_stock_manager,enteza.article.stock manager,model_enteza_article_stock,group_enteza_manager,1,1,1,1
access_enteza_rental_user,enteza.rental user,model_enteza_rental,group_enteza_user,1,1,1,0
access_enteza_rental_manager,enteza.rental manager,model_enteza_rental,group_enteza_manager,1,1,1,1
access_enteza_rental_item_user,enteza.rental.item user,model_enteza_rental_item,group_enteza_user,1,1,1,0
access_enteza_rental_item_manager,enteza.rental.item manager,model_enteza_rental_item,group_enteza_manager,1,1,1,1
access_enteza_availability,enteza.availability all,model_enteza_availability,group_enteza_user,1,0,0,0
```

---

## 9. Datos Iniciales

### `data/enteza_warehouse_data.xml`

```xml
<odoo noupdate="1">
  <record id="warehouse_sevilla" model="enteza.warehouse">
    <field name="name">Almacén Sevilla</field>
    <field name="code">SEVILLA</field>
  </record>
  <record id="warehouse_jerez" model="enteza.warehouse">
    <field name="name">Almacén Jerez</field>
    <field name="code">JEREZ</field>
  </record>
</odoo>
```

---

## 10. Estilos SCSS

```scss
// static/src/scss/enteza_dashboard.scss

.enteza-dashboard {
  min-height: 100vh;
}

// Grilla del calendario: 7 columnas iguales
.enteza-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

// Celda de día del calendario
.enteza-cal-day {
  height: 38px;
  font-size: 12px;
  border-radius: 4px;

  &:hover:not(.bg-primary) {
    background-color: #e8f0fe !important;
  }
}

// Puntos indicadores en el calendario
.enteza-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;

  &.bg-danger {
    animation: enteza-pulse 1.5s infinite;
  }
}

@keyframes enteza-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// Panel de sobreventa
.enteza-overstock-table {
  font-size: 12px;

  thead th {
    background-color: #1a3a8a;
    color: white;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 8px;
    white-space: nowrap;
  }

  tbody tr {
    cursor: pointer;
    &:hover { background-color: #eff6ff; }
    &.selected { background-color: #fef9c3; }
  }

  .deficit-value {
    color: #dc2626;
    font-weight: bold;
  }

  .committed-value {
    color: #1d4ed8;
    font-weight: bold;
  }
}

// Tabla de pedidos del día
.enteza-rentals-table {
  font-size: 12px;

  thead th {
    background-color: #e5e7eb;
    color: #374151;
    font-size: 11px;
    text-transform: uppercase;
    padding: 6px 8px;
  }

  tbody tr {
    cursor: pointer;
    &:hover { background-color: #eff6ff; }
    &.article-match {
      background-color: #fef2f2;
      td.customer-cell {
        color: #dc2626;
        font-weight: bold;
        text-decoration: underline;
      }
    }
  }

  .folio-cell {
    font-family: monospace;
    color: #1d4ed8;
  }
}
```

---

## 11. Plan de Implementación por Fases

### Fase 1: Estructura Base y Modelos
**Duración estimada: 2-3 días**
- [ ] Crear esqueleto del módulo (`__manifest__.py`, `__init__.py`)
- [ ] Implementar todos los modelos Python (warehouse, article, stock, rental, rental_item)
- [ ] Seguridad básica (grupos + permisos CSV)
- [ ] Datos iniciales (almacenes Sevilla/Jerez)
- [ ] Instalar módulo y verificar que las tablas se crean correctamente en PostgreSQL

### Fase 2: Vistas Estándar de Odoo
**Duración estimada: 1-2 días**
- [ ] Vista tree + form de `enteza.rental` con líneas
- [ ] Vista tree + form de `enteza.article` con stock por almacén
- [ ] Vista de `enteza.warehouse`
- [ ] Menús de navegación
- [ ] Verificar búsquedas y filtros

### Fase 3: Lógica de Disponibilidad
**Duración estimada: 2-3 días**
- [ ] Implementar `enteza.availability` con todos los métodos
- [ ] Implementar controlador JSON-RPC (`controllers/main.py`)
- [ ] Probar las queries SQL con datos reales
- [ ] Índices de base de datos para performance
- [ ] Verificar exclusión de clientes internos

### Fase 4: Dashboard OWL
**Duración estimada: 3-4 días**
- [ ] Client Action + registro en el registry de OWL
- [ ] Componente `EntezaDashboard` (raíz)
- [ ] Componente `CalendarWidget` con navegación de meses e indicadores
- [ ] Componente `OverstockPanel` con tabla de sobreventa
- [ ] Componente `DailyRentalsTable` con resaltado cruzado (artículo ↔ pedido)
- [ ] Estilos SCSS

### Fase 5: Modal de Detalle
**Duración estimada: 1-2 días**
- [ ] Componente `RentalDetailDialog` con cabecera + líneas agrupadas por familia
- [ ] Filtro de búsqueda de artículos dentro del modal
- [ ] Integrar con el estado global del dashboard

### Fase 6: Importación desde Sistema Legacy (SQL Server)
**Duración estimada: 3-5 días**
- [ ] Módulo/wizard de importación manual (desde la interfaz Odoo)
- [ ] Script Python standalone de sincronización periódica (cron externo o `ir.cron` de Odoo)
- [ ] Transformadores: artículos, stock, clientes, pedidos
- [ ] Manejo de clientes internos (legacy_id: 410000, 110000)
- [ ] Logging y notificaciones de error

### Fase 7: Testing y QA
**Duración estimada: 2-3 días**
- [ ] Tests unitarios Python (`tests/test_availability.py`)
- [ ] Verificar cálculo de disponibilidad con datos conocidos
- [ ] Testing de la UI en el navegador
- [ ] Performance con volumen real de datos

---

## 12. Decisiones Técnicas Clave

### 12.1 ¿Por qué no usar `sale.order`?
Los pedidos de alquiler tienen una lógica temporal muy específica (3 fechas: entrega, evento, recogida) que no encaja bien en el modelo de venta estándar de Odoo. Crear un modelo propio `enteza.rental` es más limpio, rápido de implementar y evita conflictos con otros módulos.

### 12.2 ¿Por qué no usar `res.partner` vs. modelo de cliente propio?
Se decide **extender `res.partner`** en lugar de crear un modelo nuevo, porque:
- Odoo tiene toda la infraestructura de contactos (deduplicación, búsqueda, dirección)
- Solo necesitamos añadir 2 campos: `is_enteza_internal` y `enteza_legacy_id`
- El módulo sigue siendo compatible con el ecosistema Odoo

### 12.3 Performance del Cálculo de Disponibilidad
La función SQL usa CTEs (Common Table Expressions) para evitar el costoso `CROSS JOIN` de todos los días del año con todos los artículos. Solo evalúa los días que tienen eventos reales, lo que la hace 10-50x más rápida con volúmenes reales de datos (miles de pedidos).

Los índices críticos para el rendimiento:
```sql
-- En enteza_rental (para búsqueda por rango de fechas)
CREATE INDEX idx_enteza_rental_dates ON enteza_rental(delivery_date, pickup_date)
WHERE status != 'cancelled';

-- En enteza_rental (pivot de UI)
CREATE INDEX idx_enteza_rental_event_date ON enteza_rental(event_date)
WHERE status != 'cancelled';

-- En enteza_rental_item (JOIN con artículos)
CREATE INDEX idx_enteza_rental_item_article ON enteza_rental_item(article_id)
INCLUDE (rental_id, quantity);
```

### 12.4 Calendario en OWL vs. vista Calendar de Odoo
Se usa un componente OWL personalizado porque:
- La vista Calendar nativa de Odoo está optimizada para gestión de eventos, no para indicadores de stock
- Se necesita renderizar 3 tipos de indicadores (verde/naranja/rojo) con lógica específica del negocio
- El componente custom es más ligero y controlable

### 12.5 Sincronización con Sistema Legacy
Se recomienda implementar **dos mecanismos** (igual que en la app actual):
1. **Importación manual**: Wizard en Odoo que hace la conexión al SQL Server bajo demanda
2. **Cron externo**: Script Python dockerizado en el CPD con acceso directo a la red interna (más fiable, no depende de la disponibilidad de Odoo)

---

## 13. Glosario

| Término del Negocio | Campo en Odoo | Descripción |
|---------------------|---------------|-------------|
| Folio / Nº Pedido | `enteza.rental.legacy_id` | ID del sistema antiguo PHP |
| Artículo | `enteza.article` | Producto de alquiler (silla, mesa...) |
| Familia | `enteza.article.family` | Categoría del artículo (SILLAS, MESAS...) |
| Stock | `enteza.article.stock.quantity` | Unidades en almacén |
| Reserva / Pedido | `enteza.rental` | Pedido de alquiler de un cliente |
| Línea de pedido | `enteza.rental.item` | Artículo + cantidad dentro del pedido |
| Fecha Entrega | `enteza.rental.delivery_date` | El material sale del almacén |
| Fecha Evento | `enteza.rental.event_date` | Día del evento del cliente (pivot UI) |
| Fecha Recogida | `enteza.rental.pickup_date` | El material vuelve al almacén |
| Rotura de Stock | — | Cuando committed > total_stock para una fecha |
| Sobreventa | — | Déficit = total_stock - committed < 0 |
| Cliente Interno | `res.partner.is_enteza_internal = True` | Préstamos entre almacenes (no cuentan) |
| Almacén Sevilla | `enteza.warehouse` code='SEVILLA' | Almacén principal |
| Almacén Jerez | `enteza.warehouse` code='JEREZ' | Almacén secundario |

---

## 14. Notas de la Pantalla de Referencia (machu-1.jpg)

La imagen de referencia muestra la pantalla de disponibilidad de la app web actual, con un modal de detalle de artículo abierto sobre la tabla principal. Los elementos clave observados:

- **Encabezado del modal**: Nombre del artículo + código (ART-XXXX) + stock total desglosado (S: Sevilla / J: Jerez) + fecha del evento consultado
- **Tabla del modal**: ALMACEN | EVENTO | CLIENTE | LUGAR | UDS. | ACUMULADO | DISPONIBLE
  - Muestra qué pedidos contribuyen al agotamiento del artículo
  - La columna ACUMULADO va sumando unidades pedido a pedido
  - La columna DISPONIBLE = total_stock - acumulado (en rojo si negativo)
- **Tabla de fondo**: Lista de artículos en sobreventa con: fecha, nombre+código, familia, columnas numéricas
- **Colores**: Fondo azul marino corporativo, texto blanco para cabeceras, rojo para déficits, colores negativos destacados

Esta vista de detalle de artículo (el modal) es una funcionalidad adicional al spec actual que puede añadirse como mejora en una fase posterior, llamando al endpoint `get_article_reservations`.

---

*Documento generado el 2026-02-22. Basado en el análisis completo de Enteza Reservas App (Next.js + Supabase).*
