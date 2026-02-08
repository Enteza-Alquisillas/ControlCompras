import sql from 'mssql'

const configs = {
    SEVILLA: {
        server: process.env.SEVILLA_SQL_SERVER!,
        database: process.env.SEVILLA_SQL_DATABASE!,
        user: process.env.SEVILLA_SQL_USER!,
        password: process.env.SEVILLA_SQL_PASSWORD!,
        options: {
            encrypt: false,
            trustServerCertificate: true,
        },
    },
    JEREZ: {
        server: process.env.JEREZ_SQL_SERVER!,
        database: process.env.JEREZ_SQL_DATABASE!,
        user: process.env.JEREZ_SQL_USER!,
        password: process.env.JEREZ_SQL_PASSWORD!,
        options: {
            encrypt: false,
            trustServerCertificate: true,
        },
    }
}

export const legacyService = {
    async getLegacyData(table: string, warehouse: 'SEVILLA' | 'JEREZ') {
        const config = configs[warehouse]
        if (!config || !config.server) {
            throw new Error(`Configuración SQL Server incompleta para ${warehouse}`)
        }

        const pool = await sql.connect(config)
        try {
            let query = ''
            switch (table) {
                case 'articles':
                    const mappingField = warehouse === 'SEVILLA' ? 'ID_MATERIAL_JEREZ' : 'ID_MATERIAL_SEVILLA'
                    query = `
              SELECT 
                ID_MATERIAL,
                DESCRIPCION,
                CLASIFICACION,
                EXISTENCIA,
                ${mappingField}
              FROM dbo.ARTICULO_ALQUILER
              WHERE BAJA = 0
            `
                    break
                case 'customers':
                    query = `
              SELECT 
                ID_CLIENTE,
                NOMBRE_CLIENTE,
                TEL1,
                EMAIL
              FROM dbo.CLIENTE
            `
                    break
                case 'rentals':
                    query = `
            SELECT 
              e.ID_EVENTO,
              e.ID_CLIENTE,
              e.FECHA_EVENTO,
              e.FECHA_ENTREGA,
              e.FECHA_RECOLECTA,
              e.STATUS,
              e.NOTAS,
              e.LUGAR_DESCRIPCION,
              ed.ID_MATERIAL,
              ed.CANTIDAD,
              ed.NOTAS_ITEM
            FROM dbo.EVENTO_ALQUILER e
            LEFT JOIN dbo.EVENTO_ALQUILER_DETALLE ed ON e.ID_EVENTO = ed.ID_EVENTO
            WHERE e.FECHA_EVENTO >= DATEADD(month, -3, GETDATE())
            AND e.ID_CLIENTE NOT IN (410000, 110000)
          `
                    break
                case 'test':
                    query = 'SELECT 1 as connected'
                    break;
                default:
                    throw new Error('Tabla inválida')
            }

            const result = await pool.request().query(query)
            return result.recordset
        } finally {
            await pool.close()
        }
    }
}
