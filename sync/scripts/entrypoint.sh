#!/bin/sh
set -e

# Ensure logs directory exists and is writable
mkdir -p /app/logs

# Run the sync with all passed arguments
exec node dist/index.js "$@"
