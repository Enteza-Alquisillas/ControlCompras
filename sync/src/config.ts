import * as dotenv from 'dotenv'
import path from 'path'

// Load .env from sync directory
dotenv.config({ path: path.join(__dirname, '..', '.env') })

export interface SqlServerConfig {
  server: string
  database: string
  user: string
  password: string
  options: {
    encrypt: boolean
    trustServerCertificate: boolean
  }
}

export interface Config {
  sqlServer: {
    SEVILLA: SqlServerConfig
    JEREZ: SqlServerConfig
  }
  supabase: {
    url: string
    serviceRoleKey: string
  }
  logging: {
    level: string
    dir: string
  }
  email: {
    enabled: boolean
    host: string
    port: number
    user: string
    password: string
    to: string
    from: string
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue
}

export function loadConfig(): Config {
  return {
    sqlServer: {
      SEVILLA: {
        server: requireEnv('SEVILLA_SQL_SERVER'),
        database: requireEnv('SEVILLA_SQL_DATABASE'),
        user: requireEnv('SEVILLA_SQL_USER'),
        password: requireEnv('SEVILLA_SQL_PASSWORD'),
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      },
      JEREZ: {
        server: requireEnv('JEREZ_SQL_SERVER'),
        database: requireEnv('JEREZ_SQL_DATABASE'),
        user: requireEnv('JEREZ_SQL_USER'),
        password: requireEnv('JEREZ_SQL_PASSWORD'),
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      },
    },
    supabase: {
      url: requireEnv('SUPABASE_URL'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },
    logging: {
      level: optionalEnv('LOG_LEVEL', 'info'),
      dir: optionalEnv('LOG_DIR', './logs'),
    },
    email: {
      enabled: Boolean(process.env.SMTP_HOST),
      host: optionalEnv('SMTP_HOST', ''),
      port: parseInt(optionalEnv('SMTP_PORT', '587'), 10),
      user: optionalEnv('SMTP_USER', ''),
      password: optionalEnv('SMTP_PASSWORD', ''),
      to: optionalEnv('ALERT_EMAIL_TO', ''),
      from: optionalEnv('ALERT_EMAIL_FROM', ''),
    },
  }
}

export type Warehouse = 'SEVILLA' | 'JEREZ'
export const WAREHOUSES: Warehouse[] = ['SEVILLA', 'JEREZ']
