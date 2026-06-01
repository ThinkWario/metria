/**
 * App Constants
 * Single source of truth for global configuration.
 */

// Use NEXT_PUBLIC_ prefix to expose variables to the browser
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://bobyads-backend-m.3awmod.easypanel.host/api'

// Derived base URL for sockets (remove /api suffix)
export const SOCKET_URL = API_BASE_URL.replace(/\/api$/, '')
