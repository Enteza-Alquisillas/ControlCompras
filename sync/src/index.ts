#!/usr/bin/env node
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { loadConfig, Warehouse, WAREHOUSES } from './config.js'
import { initLogger, getLogger } from './utils/logger.js'
import { SyncService, SyncOptions } from './services/syncService.js'

const LOCK_FILE = '/tmp/enteza-sync.lock'

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = fs.readFileSync(LOCK_FILE, 'utf-8').trim()
      // Check if process is still running (Unix only)
      try {
        process.kill(parseInt(pid, 10), 0)
        return false // Process still running
      } catch {
        // Process not running, remove stale lock
        fs.unlinkSync(LOCK_FILE)
      }
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString())
    return true
  } catch {
    return true // Assume lock acquired on Windows or if /tmp not writable
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE)
    }
  } catch {
    // Ignore errors
  }
}

async function main() {
  const program = new Command()

  program
    .name('enteza-sync')
    .description('Synchronize data from SQL Server to Supabase')
    .version('1.0.0')
    .option('-w, --warehouse <warehouse>', 'Sync only this warehouse (SEVILLA or JEREZ)')
    .option('--only <type>', 'Sync only masters (articles+customers) or rentals')
    .option('--dry-run', 'Do not write to Supabase, only log what would be done')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--test-connections', 'Test database connections and exit')
    .option('--no-lock', 'Do not use lock file (allows concurrent runs)')

  program.parse()
  const opts = program.opts()

  // Load configuration
  let config
  try {
    config = loadConfig()
  } catch (error) {
    console.error('Failed to load configuration:', (error as Error).message)
    console.error('Make sure .env file exists with all required variables.')
    process.exit(1)
  }

  // Initialize logger
  const logLevel = opts.verbose ? 'debug' : config.logging.level
  initLogger(logLevel, config.logging.dir)
  const logger = getLogger()

  // Acquire lock
  if (opts.lock !== false && !acquireLock()) {
    logger.error('Another sync process is already running. Exiting.')
    process.exit(1)
  }

  try {
    const syncService = new SyncService(config, opts.dryRun)

    // Test connections mode
    if (opts.testConnections) {
      const allOk = await syncService.testConnections()
      process.exit(allOk ? 0 : 1)
    }

    // Validate warehouse option
    if (opts.warehouse && !WAREHOUSES.includes(opts.warehouse as Warehouse)) {
      logger.error(`Invalid warehouse: ${opts.warehouse}. Must be one of: ${WAREHOUSES.join(', ')}`)
      process.exit(1)
    }

    // Validate only option
    if (opts.only && !['masters', 'rentals'].includes(opts.only)) {
      logger.error(`Invalid --only value: ${opts.only}. Must be 'masters' or 'rentals'`)
      process.exit(1)
    }

    // Run sync
    const syncOptions: SyncOptions = {
      warehouse: opts.warehouse as Warehouse | undefined,
      only: opts.only as 'masters' | 'rentals' | undefined,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    }

    const summary = await syncService.sync(syncOptions)

    // Print summary
    console.log('\n========== SYNC SUMMARY ==========')
    console.log(`Started: ${summary.startedAt.toISOString()}`)
    console.log(`Completed: ${summary.completedAt.toISOString()}`)
    console.log(`Duration: ${Math.round((summary.completedAt.getTime() - summary.startedAt.getTime()) / 1000)}s`)
    console.log(`Status: ${summary.totalSuccess ? 'SUCCESS' : 'FAILED'}`)
    console.log('')

    summary.results.forEach((r) => {
      const status = r.success ? '✓' : '✗'
      const skipped = r.skipped ? ` (${r.skipped} skipped)` : ''
      const errors = r.errors ? ` - ${r.errors.join(', ')}` : ''
      console.log(`${status} ${r.entity}: ${r.count} records${skipped}${errors}`)
    })

    if (summary.criticalErrors.length > 0) {
      console.log('\nCritical Errors:')
      summary.criticalErrors.forEach((e) => console.log(`  - ${e}`))
    }

    console.log('==================================\n')

    process.exit(summary.totalSuccess ? 0 : 1)
  } finally {
    if (opts.lock !== false) {
      releaseLock()
    }
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  releaseLock()
  process.exit(1)
})
