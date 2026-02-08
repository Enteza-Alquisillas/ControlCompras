import nodemailer from 'nodemailer'
import { Config } from '../config.js'
import { SyncSummary } from '../types/index.js'
import { getLogger } from '../utils/logger.js'

export class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private config: Config['email']

  constructor(config: Config['email']) {
    this.config = config

    if (config.enabled && config.host && config.user && config.password) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.password,
        },
      })
    }
  }

  async sendErrorAlert(summary: SyncSummary): Promise<void> {
    const logger = getLogger()

    if (!this.transporter || !this.config.to) {
      logger.warn('Email not configured, skipping error alert')
      return
    }

    const failedResults = summary.results.filter((r) => !r.success)
    const subject = `[ENTEZA SYNC] Error en sincronizacion - ${new Date().toISOString().split('T')[0]}`

    const html = `
      <h2>Error en Sincronizacion Enteza</h2>
      <p><strong>Fecha:</strong> ${summary.startedAt.toISOString()}</p>
      <p><strong>Warehouse:</strong> ${summary.warehouse || 'Todos'}</p>

      <h3>Errores Criticos:</h3>
      <ul>
        ${summary.criticalErrors.map((e) => `<li style="color: red;">${e}</li>`).join('')}
      </ul>

      <h3>Resultados por Entidad:</h3>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr>
          <th>Entidad</th>
          <th>Estado</th>
          <th>Registros</th>
          <th>Errores</th>
        </tr>
        ${summary.results
          .map(
            (r) => `
          <tr style="background-color: ${r.success ? '#d4edda' : '#f8d7da'}">
            <td>${r.entity}</td>
            <td>${r.success ? 'OK' : 'ERROR'}</td>
            <td>${r.count}</td>
            <td>${r.errors?.join(', ') || '-'}</td>
          </tr>
        `
          )
          .join('')}
      </table>

      <p style="color: #666; font-size: 12px;">
        Este es un mensaje automatico del servicio de sincronizacion Enteza.
      </p>
    `

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to,
        subject,
        html,
      })
      logger.info('Error alert email sent', { to: this.config.to })
    } catch (error) {
      logger.error('Failed to send error alert email', { error: (error as Error).message })
    }
  }

  async sendSuccessSummary(summary: SyncSummary): Promise<void> {
    const logger = getLogger()

    if (!this.transporter || !this.config.to) {
      return
    }

    // Only send success emails if there were partial errors
    const hasPartialErrors = summary.results.some((r) => r.errors && r.errors.length > 0)
    if (!hasPartialErrors) {
      return
    }

    const subject = `[ENTEZA SYNC] Sincronizacion completada con advertencias - ${new Date().toISOString().split('T')[0]}`

    const html = `
      <h2>Sincronizacion Enteza Completada</h2>
      <p><strong>Fecha:</strong> ${summary.startedAt.toISOString()}</p>
      <p><strong>Duracion:</strong> ${Math.round((summary.completedAt.getTime() - summary.startedAt.getTime()) / 1000)}s</p>
      <p><strong>Warehouse:</strong> ${summary.warehouse || 'Todos'}</p>

      <h3>Resultados:</h3>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr>
          <th>Entidad</th>
          <th>Registros</th>
          <th>Saltados</th>
          <th>Advertencias</th>
        </tr>
        ${summary.results
          .map(
            (r) => `
          <tr>
            <td>${r.entity}</td>
            <td>${r.count}</td>
            <td>${r.skipped || 0}</td>
            <td>${r.errors?.length || 0}</td>
          </tr>
        `
          )
          .join('')}
      </table>
    `

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to,
        subject,
        html,
      })
      logger.info('Success summary email sent', { to: this.config.to })
    } catch (error) {
      logger.error('Failed to send success summary email', { error: (error as Error).message })
    }
  }
}
