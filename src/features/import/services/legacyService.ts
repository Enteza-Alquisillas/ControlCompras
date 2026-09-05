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
    /**
     * @param startDate Fecha minima de FECHA_EVENTO en formato YYYY-MM-DD, solo
     * aplica a la tabla 'rentals'. Si se omite, se usa el rango por defecto
     * (ultimos 3 meses) para no cambiar el comportamiento de una sincronizacion normal.
     * @param endDate Fecha maxima de FECHA_EVENTO (YYYY-MM-DD, inclusive), solo
     * aplica a 'rentals'. Permite traer historico en tramos (por trimestre, por
     * ejemplo) en vez de un unico import gigante.
     */
    async getLegacyData(table: string, warehouse: 'SEVILLA' | 'JEREZ', startDate?: string, endDate?: string) {
        const config = configs[warehouse]
        if (!config || !config.server) {
            throw new Error(`Configuración SQL Server incompleta para ${warehouse}`)
        }

        const pool = await sql.connect(config)
        try {
            const request = pool.request()
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
                EMAIL,
                RFC
              FROM dbo.CLIENTE
            `
                    break
                case 'rentals':
                    if (startDate) {
                        request.input('startDate', sql.Date, startDate)
                    }
                    if (endDate) {
                        request.input('endDate', sql.Date, endDate)
                    }
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
            WHERE e.FECHA_EVENTO >= ${startDate ? '@startDate' : 'DATEADD(month, -3, GETDATE())'}
            ${endDate ? 'AND e.FECHA_EVENTO <= @endDate' : ''}
            AND e.ID_CLIENTE NOT IN (410000, 110000)
            AND e.STATUS = 'VIGENTE'
          `
                    break
                case 'test':
                    query = 'SELECT 1 as connected'
                    break;
                default:
                    throw new Error('Tabla inválida')
            }

            const result = await request.query(query)
            return result.recordset
        } finally {
            await pool.close()
        }
    }
}
