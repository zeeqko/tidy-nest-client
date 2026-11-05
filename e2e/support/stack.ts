// Ports of the isolated e2e stack. Deliberately not 8080/5173, which belong to
// the developer's own backend and Vite dev server.
export const API_PORT = 18080;
export const APP_PORT = 15173;
export const API_URL = `http://localhost:${API_PORT}`;
export const APP_URL = `http://localhost:${APP_PORT}`;
