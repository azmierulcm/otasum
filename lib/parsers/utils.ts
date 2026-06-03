export interface FuelEntry { kg: number; time: string; }

export function fuelFmt({ kg, time }: FuelEntry): string {
  return `**${kg.toLocaleString()} kg** (${time})`;
}

export function kgFmt(kg: number): string {
  return `${kg.toLocaleString()} kg`;
}

export function tonToKg(tonnes: number): number {
  return Math.round(tonnes * 1000);
}

/** Extract (kg, HH:MM) from a Lido fuel label line. Handles optional ICAO code between label and numbers. */
export function parseFuel(text: string, label: string): FuelEntry | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`${escaped}[^\n]{0,40}?(\\d{3,6})\\s+(\\d{2}:\\d{2})`, 'i'));
  if (!m) return null;
  return { kg: parseInt(m[1]), time: m[2] };
}

export function orNA(val: string | null | undefined): string {
  return val?.trim() || 'N/A';
}

/** Convert 0016 → "00:16", 0118 → "01:18" */
export function hhmmFmt(raw: string): string {
  if (raw.length === 4) return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  return raw;
}
