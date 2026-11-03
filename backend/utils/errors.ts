// Utilidades mínimas de errores para toda la capa backend.
export function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string' && cause.trim()) return cause
  return 'Ocurrió un error inesperado.'
}
