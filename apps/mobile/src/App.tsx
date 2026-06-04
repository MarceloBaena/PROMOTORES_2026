import { createForegroundLocationTracker } from "./locationHeartbeat";

export const mobileLocationTracker = createForegroundLocationTracker({
  apiBaseUrl: "https://promotores-2026-api.vercel.app",
  getAccessToken: () => null,
  getCoordinates: () => null,
  isOperationallyActive: () => false
});

export function App() {
  return null;
}
