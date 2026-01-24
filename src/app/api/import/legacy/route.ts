import sql from 'mssql'
import { NextRequest, NextResponse } from 'next/server'

const configs = {
  SEVILLA: {
    server: process.env.SEVILLA_SQL_SERVER || '',
    database: process.env.SEVILLA_SQL_DATABASE || '',
    user: process.env.SEVILLA_SQL_USER || '',
    password: process.env.SEVILLA_SQL_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  },
  JEREZ: {
    server: process.env.JEREZ_SQL_SERVER || '',
    database: process.env.JEREZ_SQL_DATABASE || '',
    user: process.env.JEREZ_SQL_USER || '',
    password: process.env.JEREZ_SQL_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const { table, warehouse } = await request.json()
    const config = configs[warehouse as keyof typeof configs]

    if (!config) {
      return NextResponse.json({ success: false, error: 'Invalid warehouse specified' }, { status: 400 })
    }

    // Validate required environment variables for the specific warehouse
    if (!config.server || !config.database || !config.user || !config.password) {
      return NextResponse.json(
        { success: false, error: `SQL Server configuration missing for ${warehouse} in .env.local` },
        { status: 500 }
      )
    }

    const pool = await sql.connect(config)

    let query = ''
    switch (table) {
      case 'articles':
        const mappingField = warehouse === 'SEVILLA' ? 'ID_MATERIAL_JEREZ' : 'ID_MATERIAL_SEVILLA'
        query = `
          SELECT 
            ID_MATERIAL,
            DESCRIPCION,
            EXISTENCIA,
            ${mappingField}
          FROM dbo.ARTICULO_ALQUILER
          WHERE BAJA = 0
        `
        break
      case 'customers':
        const custCountResult = await pool.request().query('SELECT COUNT(*) as total FROM dbo.CLIENTE')
        console.log(`[SQL Diagnostic] Total customers in ${warehouse}: ${custCountResult.recordset[0].total}`)

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
        // Diagnostic query to see total vs filtered
        const diagnosticQuery = 'SELECT COUNT(*) as total FROM dbo.EVENTO_ALQUILER'
        const futureCountQuery = 'SELECT COUNT(*) as total FROM dbo.EVENTO_ALQUILER WHERE FECHA_EVENTO >= DATEADD(month, -3, GETDATE())'

        console.log(`[SQL] Diagnostic Query (Total): ${diagnosticQuery}`)
        console.log(`[SQL] Diagnostic Query (Future): ${futureCountQuery}`)

        const diagnosticResult = await pool.request().query(diagnosticQuery)
        const futureCountResult = await pool.request().query(futureCountQuery)

        console.log(`[SQL Diagnostic] Total rentals in DB: ${diagnosticResult.recordset[0].total}`)
        console.log(`[SQL Diagnostic] Total FUTURE rentals (>= today): ${futureCountResult.recordset[0].total}`)

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
        `
        console.log(`[SQL] Main Query: ${query}`)
        break
      case 'test':
        query = 'SELECT 1 as connected'
        break
      default:
        return NextResponse.json({ success: false, error: 'Invalid table specified' }, { status: 400 })
    }

    const result = await pool.request().query(query)
    await pool.close()

    return NextResponse.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    })

  } catch (error) {
    console.error('Detailed SQL Server Integration Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error) || 'Unknown SQL Server error'
    }, { status: 500 })
  }
}
