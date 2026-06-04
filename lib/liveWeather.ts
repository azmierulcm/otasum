/**
 * liveWeather.ts
 *
 * Fetches live METAR + TAF from the Aviation Weather Center (NOAA/AWC).
 * No API key required. Returns compact structured JSON for the AI.
 *
 * API docs: https://aviationweather.gov/api/data
 */

import { parseMetar, parseTAF } from 'metar-taf-parser';

const AWC = 'https://aviationweather.gov/api/data';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AirportLiveWx {
  icao:      string;
  metar_raw: string;
  metar?:    object;
  taf_raw:   string;
  taf?:      object;
}

// ── Compact serialisers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactMetar(m: any): object {
  return {
    time:   m.day != null
      ? `${m.day}${String(m.hour ?? 0).padStart(2,'0')}${String(m.minute ?? 0).padStart(2,'0')}Z`
      : null,
    wind:   m.wind   ? { dir: m.wind.degrees ?? m.wind.direction, speed: m.wind.speed, gust: m.wind.gust ?? null, unit: m.wind.unit } : null,
    vis:    m.visibility?.value ?? null,
    wx:     (m.weatherConditions ?? []).map((w: any) => w.phenomenon ?? w).filter(Boolean),
    clouds: (m.clouds ?? []).map((c: any) => ({ qty: c.quantity, height: c.height ?? null, type: c.type ?? null })),
    temp:   m.temperature ?? null,
    dew:    m.dewPoint    ?? null,
    qnh:    m.altimeter?.value ?? null,
    nosig:  m.nosig ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactTaf(t: any): object {
  const fmtV = (v: any) =>
    v ? `${v.startDay}${String(v.startHour ?? 0).padStart(2,'0')}Z/${v.endDay}${String(v.endHour ?? 0).padStart(2,'0')}Z` : null;
  return {
    valid:  fmtV(t.validity),
    trends: (t.trends ?? []).map((tr: any) => ({
      type:   tr.type ?? null,
      valid:  fmtV(tr.validity),
      prob:   tr.probability ?? null,
      wind:   tr.wind ? { dir: tr.wind.degrees ?? tr.wind.direction, speed: tr.wind.speed, gust: tr.wind.gust ?? null, unit: tr.wind.unit } : null,
      vis:    tr.visibility?.value ?? null,
      wx:     (tr.weatherConditions ?? []).map((w: any) => w.phenomenon ?? w).filter(Boolean),
      clouds: (tr.clouds ?? []).map((c: any) => ({ qty: c.quantity, height: c.height ?? null, type: c.type ?? null })),
    })),
  };
}

function parseRaw(raw: string, parser: 'metar' | 'taf'): object | undefined {
  if (!raw) return undefined;
  try {
    return parser === 'metar'
      ? compactMetar(parseMetar(raw))
      : compactTaf(parseTAF(raw));
  } catch {
    return undefined;
  }
}

// ── AWC API fetchers ──────────────────────────────────────────────────────────

async function fetchMetars(icaos: string[]): Promise<Map<string, string>> {
  const ids = icaos.join(',');
  const map = new Map<string, string>();
  try {
    const res  = await fetch(`${AWC}/metar?ids=${ids}&format=json&hours=3`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as any[];
    for (const m of data) {
      if (m.icaoId && m.rawOb) map.set(m.icaoId, m.rawOb);
    }
  } catch (err) {
    console.warn('[liveWeather] METAR fetch failed:', err);
  }
  return map;
}

async function fetchTafs(icaos: string[]): Promise<Map<string, string>> {
  const ids = icaos.join(',');
  const map = new Map<string, string>();
  try {
    const res  = await fetch(`${AWC}/taf?ids=${ids}&format=json`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as any[];
    for (const t of data) {
      if (t.icaoId && t.rawTAF) map.set(t.icaoId, t.rawTAF);
    }
  } catch (err) {
    console.warn('[liveWeather] TAF fetch failed:', err);
  }
  return map;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetch live METAR + TAF for all airports in one batch request each.
 * Returns a Map<ICAO, AirportLiveWx>.
 */
export async function fetchLiveWeather(icaos: string[]): Promise<Map<string, AirportLiveWx>> {
  const unique = icaos.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  const [metars, tafs] = await Promise.all([
    fetchMetars(unique),
    fetchTafs(unique),
  ]);

  const result = new Map<string, AirportLiveWx>();
  for (const icao of unique) {
    const metar_raw = metars.get(icao) ?? '';
    const taf_raw   = tafs.get(icao)   ?? '';
    result.set(icao, {
      icao,
      metar_raw,
      metar: parseRaw(metar_raw, 'metar'),
      taf_raw,
      taf:   parseRaw(taf_raw,   'taf'),
    });
  }

  console.log(`[liveWeather] fetched ${result.size} airports — METARs: ${metars.size}, TAFs: ${tafs.size}`);
  return result;
}
