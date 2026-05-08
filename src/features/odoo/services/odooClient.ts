import type { OdooRpcResponse, OdooSession } from '../types'

interface OdooClientConfig {
  url: string
  db: string
  user: string
  password: string
}

export class OdooClient {
  private config: OdooClientConfig
  private session: OdooSession | null = null
  private requestId = 0

  constructor(config: OdooClientConfig) {
    this.config = config
  }

  private nextId(): number {
    return ++this.requestId
  }

  async authenticate(): Promise<OdooSession> {
    const response = await fetch(`${this.config.url}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: this.nextId(),
        params: {
          db: this.config.db,
          login: this.config.user,
          password: this.config.password,
        },
      }),
    })

    const data = await response.json() as OdooRpcResponse<{ uid: number; session_id: string }>

    if (data.error) {
      throw new Error(`Odoo auth error: ${data.error.data?.message ?? data.error.message}`)
    }
    if (!data.result?.uid) {
      throw new Error('Odoo auth failed: credenciales inválidas o base de datos incorrecta')
    }

    // Extract session_id from Set-Cookie header (Odoo sets it as a cookie)
    const setCookieHeader = response.headers.get('set-cookie') ?? ''
    const sessionMatch = setCookieHeader.match(/session_id=([^;]+)/)
    const sessionId = sessionMatch?.[1] ?? data.result.session_id ?? ''

    this.session = { uid: data.result.uid, sessionId }
    return this.session
  }

  async callKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.session) {
      await this.authenticate()
    }

    const response = await fetch(`${this.config.url}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${this.session!.sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: this.nextId(),
        params: { model, method, args, kwargs },
      }),
    })

    const data = await response.json() as OdooRpcResponse<T>

    if (data.error) {
      throw new Error(
        `Odoo RPC error [${model}.${method}]: ${data.error.data?.message ?? data.error.message}`
      )
    }

    return data.result as T
  }

  async searchRead<T>(
    model: string,
    domain: unknown[][],
    fields: string[],
    limit = 100
  ): Promise<T[]> {
    return this.callKw<T[]>(model, 'search_read', [domain], { fields, limit })
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return this.callKw<number>(model, 'create', [values])
  }

  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return this.callKw<boolean>(model, 'write', [ids, values])
  }
}

export function createOdooClient(): OdooClient {
  const url = process.env.ODOO_URL
  const db = process.env.ODOO_DB
  const user = process.env.ODOO_USER
  const password = process.env.ODOO_PASSWORD

  if (!url || !db || !user || !password) {
    throw new Error(
      'Odoo no configurado. Variables requeridas: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD'
    )
  }

  return new OdooClient({ url, db, user, password })
}
