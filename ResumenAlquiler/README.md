# ResumenAlquiler — Módulo Odoo Enterprise 19

Carpeta raíz del nuevo proyecto: módulo Odoo para gestión de alquiler de material de eventos.

## Estructura

```
ResumenAlquiler/
├── README.md           ← Este archivo (índice del proyecto)
└── doc/
    └── 01_ESPECIFICACION_MODULO_ODOO.md   ← Especificación técnica completa
```

## Documentos disponibles

| Archivo | Contenido |
|---------|-----------|
| `doc/01_ESPECIFICACION_MODULO_ODOO.md` | Especificación técnica completa del módulo `enteza_rental`: modelos Python, lógica SQL de disponibilidad, vistas XML, componentes OWL, seguridad, datos iniciales y plan de implementación |

## Origen del conocimiento

Toda la documentación está extraída del análisis de **Enteza Reservas App** (carpeta `../src/`), una aplicación web operativa en producción (Next.js 16 + Supabase/PostgreSQL) que implementa la misma lógica de negocio.

## Cómo empezar

1. Leer `doc/01_ESPECIFICACION_MODULO_ODOO.md` de principio a fin
2. Crear la carpeta del módulo siguiendo la estructura de la Sección 2
3. Implementar por fases (ver Sección 11 del documento)
