interface Odoo19Config {
  url: string
  database: string
  apiKey: string
  sevillaCompany: string
  jerezCompany: string
}

interface Odoo19ErrorBody {
  name?: string
  message?: string
  debug?: string
}

const RETRY_DELAYS_MS = [1000, 4000, 9000]

export class Odoo19Error extends Error {}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function describeClientError(status: number, operation: string, detail: string): string {
  if (status === 401) return `Odoo 19 rechazó la API key al ejecutar ${operation}. Revisa ODOO19_API_KEY.`
  if (status === 403) return `Sin permisos en Odoo 19 para ${operation}: ${detail}`
  if (status === 404) return `Odoo 19 no reconoce ${operation} (modelo, método o URL incorrectos): ${detail}`
  return `Odoo 19 rechazó ${operation}: ${detail}`
}

export class Odoo19Client {
  constructor(private readonly config: Odoo19Config) {}

  get companyNames(): { sevilla: string; jerez: string } {
    return {
      sevilla: this.config.sevillaCompany,
      jerez: this.config.jerezCompany,
    }
  }

  async searchRead<T>(
    model: string,
    domain: unknown[][],
    fields: string[],
    context: Record<string, unknown> = {},
    limit = 100
  ): Promise<T[]> {
    return this.call<T[]>(model, 'search_read', { domain, fields, context, limit })
  }

  async create(
    model: string,
    values: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<number> {
    const ids = await this.call<number[]>(model, 'create', { vals_list: [values], context })
    return ids[0]
  }

  private async call<T>(model: string, method: string, params: Record<string, unknown>): Promise<T> {
    const operation = `${model}.${method}`
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]))
      }

      let response: Response
      try {
        response = await fetch(`${this.config.url}/json/2/${model}/${method}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
            'X-Odoo-Database': this.config.database,
          },
          body: JSON.stringify(params),
        })
      } catch (networkError) {
        const reason = networkError instanceof Error ? networkError.message : 'error de red desconocido'
        lastError = new Odoo19Error(`No se pudo conectar con Odoo 19 al ejecutar ${operation}: ${reason}`)
        if (attempt === RETRY_DELAYS_MS.length) throw lastError
        continue
      }

      const bodyText = await response.text()

      if (response.ok) {
        return (bodyText ? JSON.parse(bodyText) : null) as T
      }

      const errorBody = (parseJsonSafely(bodyText) ?? {}) as Odoo19ErrorBody
      const detail = errorBody.message ?? bodyText.slice(0, 500) ?? `HTTP ${response.status}`
      if (errorBody.debug) console.error(`[Odoo19] ${operation} falló:\n${errorBody.debug}`)

      if (response.status >= 500) {
        lastError = new Odoo19Error(`Odoo 19 devolvió un error de servidor al ejecutar ${operation} (HTTP ${response.status}): ${detail}`)
        if (attempt === RETRY_DELAYS_MS.length) throw lastError
        continue
      }

      throw new Odoo19Error(describeClientError(response.status, operation, detail))
    }

    throw lastError ?? new Odoo19Error(`No se pudo conectar con Odoo 19 al ejecutar ${operation}`)
  }
}

export function createOdoo19Client(): Odoo19Client {
  const url = process.env.ODOO19_URL
  const database = process.env.ODOO19_DB
  const apiKey = process.env.ODOO19_API_KEY
  const sevillaCompany = process.env.ODOO19_SEVILLA_COMPANY
  const jerezCompany = process.env.ODOO19_JEREZ_COMPANY

  if (!url || !database || !apiKey || !sevillaCompany || !jerezCompany) {
    throw new Error(
      'Odoo 19 no configurado. Se requieren ODOO19_URL, ODOO19_DB, ODOO19_API_KEY, ODOO19_SEVILLA_COMPANY y ODOO19_JEREZ_COMPANY.'
    )
  }

  return new Odoo19Client({ url: url.replace(/\/$/, ''), database, apiKey, sevillaCompany, jerezCompany })
}
