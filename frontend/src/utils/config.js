/**
 * Global Configuration & Production Environment Variable Resolver
 * Supports Vercel deployment pointing to Render backend (VITE_BACKEND_URL and VITE_WS_URL)
 * with automatic fallback to local Wi-Fi IP for development.
 */

const getHostname = () => (typeof window !== 'undefined' ? window.location.hostname : 'localhost');

// Backend HTTP API URL (e.g. https://pulsr-backend.onrender.com)
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || `http://${getHostname()}:5001`;

// WebSocket URL (e.g. wss://pulsr-backend.onrender.com)
export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${getHostname()}:5001`;
