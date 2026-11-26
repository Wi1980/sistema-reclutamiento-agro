const TZ = 'America/Lima';

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-PE', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function fmtFechaLarga(date: Date): string {
  return date.toLocaleDateString('es-PE', {
    timeZone: TZ,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function fmtHoraConSegundos(date: Date): string {
  return date.toLocaleTimeString('es-PE', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
