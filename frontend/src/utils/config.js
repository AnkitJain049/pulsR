/**
 * Global Configuration & Production Environment Variable Resolver
 * Supports Vercel deployment pointing to Render backend (VITE_BACKEND_URL and VITE_WS_URL)
 * with automatic fallback to local Wi-Fi IP for development and Mixed Content protection.
 */

const getHostname = () => (typeof window !== 'undefined' ? window.location.hostname : 'localhost');

let rawBackendUrl = import.meta.env.VITE_BACKEND_URL || `http://${getHostname()}:5001`;

// Prevent Chrome Mixed Content blocking on HTTPS Vercel deployments
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && rawBackendUrl.startsWith('http:')) {
  rawBackendUrl = rawBackendUrl.replace(/^http:/, 'https:');
}

export const BACKEND_URL = rawBackendUrl;

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${getHostname()}:5001`;
