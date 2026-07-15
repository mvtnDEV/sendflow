import { waitUntil } from '@vercel/functions'

// ── Ejecuta una tarea después de responder al cliente ──
// En Vercel, waitUntil mantiene viva la función hasta que la promesa termine
// (hasta maxDuration). Fuera de Vercel (dev local) la promesa corre suelta.
export function deferAfterResponse(task: Promise<unknown>, label: string): void {
  const safe = task.catch(err => console.error(`[defer:${label}] Error:`, err))
  try {
    waitUntil(safe)
  } catch {
    void safe
  }
}
