/**
 * Tiempo relativo en español.
 *
 * En una lista de versiones, "hace 2 h" se lee de un vistazo; un
 * "25/7/2026, 14:08:32" obliga a calcular mentalmente cuál es la más reciente.
 * La fecha completa se conserva en el `title` para quien la necesite.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return "hace un momento";

  const units: Array<[number, string, string]> = [
    [60, "minuto", "minutos"],
    [3600, "hora", "horas"],
    [86400, "día", "días"],
    [2592000, "mes", "meses"],
  ];

  for (let i = units.length - 1; i >= 0; i--) {
    const [size, singular, plural] = units[i];
    const value = Math.floor(seconds / size);
    if (value >= 1) {
      return `hace ${value} ${value === 1 ? singular : plural}`;
    }
  }

  return "hace un momento";
}

/** Tamaño legible: 840 B, 2.1 KB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
