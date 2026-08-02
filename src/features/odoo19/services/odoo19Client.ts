interface Odoo19Config {
  url: string
  database: string
  user: string
  apiKey: string
  sevillaCompany: string
  jerezCompany: string
}

interface OdooRpcResponse<T> {
  result?: T
  error?: { message?: string; data?: { message?: string; debug?: string } }
}

const RETRY_DELAYS_MS = [1000, 4000, 9000]

class Odoo19RpcError extends Error {}

export class Odoo19Client {
  private uid: number | null = null
  private requestId = 0

  constructor(private readonly config: Odoo19Config) {}

  get companyNames(): { sevilla: string; jerez: string } {
    return {
      sevilla: this.config.sevillaCompany,
      jerez: this.config.jerezCompany,
    }
  }

  async execute<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    const uid = await this.authenticate()
    return this.call<T>('object', 'execute_kw', [
      this.config.database,
      uid,
      this.config.apiKey,
      model,
      method,
      args,
      kwargs,
    ])
  }

  async searchRead<T>(
    model: string,
    domain: unknown[][],
    fields: string[],
    context: Record<string, unknown> = {},
    limit = 100
  ): Promise<T[]> {
    return this.execute<T[]>(model, 'search_read', [domain], { fields, context, limit })
  }

  async create(
    model: string,
    values: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<number> {
    return this.execute<number>(model, 'create', [values], { context })
  }

  private async authenticate(): Promise<number> {
    if (this.uid !== null) return this.uid

    const uid = await this.call<number | false>('common', 'authenticate', [
      this.config.database,
      this.config.user,
      this.config.apiKey,
      {},
    ])

    if (!uid) throw new Error('No se pudo autenticar con Odoo 19')
    this.uid = uid
    return uid
  }

  private async call<T>(service: string, method: string, args: unknown[]): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]))
      }

      try {
        const response = await fetch(`${this.config.url}/jsonrpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            id: ++this.requestId,
            params: { service, method, args },
          }),
        })

        if (!response.ok) {
          if (response.status >= 500) {
            lastError = new Error(`Odoo 19 devolvió HTTP ${response.status}`)
            continue
          }
          throw new Odoo19RpcError(`Odoo 19 devolvió HTTP ${response.status}`)
        }

        const data = (await response.json()) as OdooRpcResponse<T>
        if (data.error) {
          throw new Odoo19RpcError(data.error.data?.message ?? data.error.message ?? 'Error RPC de Odoo 19')
        }
        return data.result as T
      } catch (error) {
        if (error instanceof Odoo19RpcError) throw error
        if (attempt === RETRY_DELAYS_MS.length) throw error
        lastError = error instanceof Error ? error : new Error('Error de red con Odoo 19')
      }
    }

    throw lastError ?? new Error('No se pudo conectar con Odoo 19')
  }
}

export function createOdoo19Client(): Odoo19Client {
  const url = process.env.ODOO19_URL
  const database = process.env.ODOO19_DB
  const user = process.env.ODOO19_USER
  const apiKey = process.env.ODOO19_API_KEY
  const sevillaCompany = process.env.ODOO19_SEVILLA_COMPANY
  const jerezCompany = process.env.ODOO19_JEREZ_COMPANY

  if (!url || !database || !user || !apiKey || !sevillaCompany || !jerezCompany) {
    throw new Error(
      'Odoo 19 no configurado. Se requieren ODOO19_URL, ODOO19_DB, ODOO19_USER, ODOO19_API_KEY, ODOO19_SEVILLA_COMPANY y ODOO19_JEREZ_COMPANY.'
    )
  }

  return new Odoo19Client({ url, database, user, apiKey, sevillaCompany, jerezCompany })
}
