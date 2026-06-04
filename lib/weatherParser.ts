/**
 * weatherParser.ts
 *
 * Uses metar-taf-parser to extract and structure METAR/TAF data from the
 * Lido OFP weather section before sending to the AI.
 *
 * Benefits:
 *  - Reduces AI input from ~15,000 raw chars → ~2,500 compact JSON chars
 *  - Data is pre-validated — AI only needs to format, not parse
 *  - Enables Haiku (cheaper) instead of Sonnet for this module
 */

import { parseMetar, parseTAF } from 'metar-taf-parser';
import type { FlightContext } from './systemPrompt';

// ── Section splitter ──────────────────────────────────────────────────────────

interface WxSections {
  sigmets:     string;
  departure:   string;
  destination: string;
  alternate:   string;
  edto:        string;
  winds:       string;
}

/** Split the labelled === SECTION === output from extractWxSection into parts */
export function splitWxSections(wxText: string): WxSections {
  const get = (label: string): string => {
    const re = new RegExp(`=== ${label} ===([\\s\\S]+?)(?==== [A-Z]|$)`, 'i');
    return wxText.match(re)?.[1]?.trim() ?? '';
  };
  return {
    sigmets:     get('SIGMETs AND AIRMETS'),
    departure:   get('DEPARTURE AIRPORT WEATHER'),
    destination: get('DESTINATION AIRPORT WEATHER'),
    alternate:   get('DESTINATION ALTERNATE WEATHER'),
    edto:        get('EDTO CRITICAL AIRPORT WEATHER'),
    winds:       get('UPPER WINDS TABLE'),
  };
}

// ── METAR / TAF string extraction from Lido text ──────────────────────────────

/** Extract a raw METAR string for a given ICAO from freeform Lido text. */
function extractMetarRaw(text: string, icao: string): string | null {
  // With METAR/SPECI prefix
  const withPrefix = new RegExp(
    `(?:METAR|SPECI)\\s+${icao}\\s+\\d{6}Z[^\\n=]*`,
    'i',
  );
  // Without prefix (ICAO DDHHMMZ winds...)
  const withoutPrefix = new RegExp(
    `${icao}\\s+\\d{6}Z\\s+(?:AUTO\\s+|COR\\s+)?(?:(?:\\d{3}|VRB)\\d{2}(?:G\\d{2})?(?:KT|MPS)[^\\n=]*)`,
    'i',
  );
  const raw =
    text.match(withPrefix)?.[0] ??
    text.match(withoutPrefix)?.[0] ??
    null;
  return raw ? raw.replace(/=\s*$/, '').trim() : null;
}

/** Extract a raw TAF string for a given ICAO from freeform Lido text. */
function extractTafRaw(text: string, icao: string): string | null {
  const re = new RegExp(
    `TAF\\s+(?:AMD\\s+|COR\\s+)?${icao}\\s+\\d{6}Z[\\s\\S]+?(?:=|(?=\\n\\n|\\nTAF\\s|\\n[A-Z]{4}\\s+\\d{6}Z|$))`,
    'i',
  );
  const raw = text.match(re)?.[0] ?? null;
  return raw ? raw.replace(/=\s*$/, '').trim() : null;
}

// ── Compact serialisers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactMetar(m: any): object {
  return {
    time:    m.day != null ? `${m.day}${String(m.hour ?? 0).padStart(2,'0')}${String(m.minute ?? 0).padStart(2,'0')}Z` : null,
    wind:    m.wind   ? { dir: m.wind.degrees ?? m.wind.direction, speed: m.wind.speed, gust: m.wind.gust ?? null, unit: m.wind.unit } : null,
    vis:     m.visibility ? m.visibility.value : null,
    wx:      (m.weatherConditions ?? []).map((w: any) => w.phenomenon ?? w).filter(Boolean),
    clouds:  (m.clouds ?? []).map((c: any) => ({ qty: c.quantity, height: c.height ?? null, type: c.type ?? null })),
    temp:    m.temperature ?? null,
    dew:     m.dewPoint    ?? null,
    qnh:     m.altimeter?.value ?? null,
    nosig:   m.nosig ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactTaf(t: any): object {
  const fmtValidity = (v: any) =>
    v ? `${v.startDay}${String(v.startHour ?? 0).padStart(2,'0')}Z/${v.endDay}${String(v.endHour ?? 0).padStart(2,'0')}Z` : null;

  return {
    valid:  fmtValidity(t.validity),
    trends: (t.trends ?? []).map((tr: any) => ({
      type:   tr.type   ?? null,
      valid:  fmtValidity(tr.validity),
      prob:   tr.probability ?? null,
      wind:   tr.wind ? { dir: tr.wind.degrees ?? tr.wind.direction, speed: tr.wind.speed, gust: tr.wind.gust ?? null, unit: tr.wind.unit } : null,
      vis:    tr.visibility?.value ?? null,
      wx:     (tr.weatherConditions ?? []).map((w: any) => w.phenomenon ?? w).filter(Boolean),
      clouds: (tr.clouds ?? []).map((c: any) => ({ qty: c.quantity, height: c.height ?? null, type: c.type ?? null })),
    })),
  };
}

// ── Per-airport builder ───────────────────────────────────────────────────────

interface AirportWx {
  icao:       string;
  metar_raw:  string;
  metar?:     object;
  taf_raw:    string;
  taf?:       object;
}

function buildAirportWx(section: string, icao: string): AirportWx {
  const metarRaw = extractMetarRaw(section, icao) ?? '';
  const tafRaw   = extractTafRaw(section, icao)   ?? '';

  let metar: object | undefined;
  let taf:   object | undefined;

  if (metarRaw) {
    try { metar = compactMetar(parseMetar(metarRaw)); } catch { /* keep undefined */ }
  }
  if (tafRaw) {
    try { taf = compactTaf(parseTAF(tafRaw)); } catch { /* keep undefined */ }
  }

  return { icao, metar_raw: metarRaw, metar, taf_raw: tafRaw, taf };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse weather data from the OFP weather section and return a compact JSON
 * string ready to be sent to the AI (~2,500 chars vs 15,000 raw chars).
 */
export function buildCompactWeatherPayload(wxText: string, ctx: FlightContext): string {
  const sec = splitWxSections(wxText);

  const payload = {
    flight: {
      callsign:      ctx.callsign,
      dep:           ctx.dep,
      dep_name:      ctx.depName,
      dest:          ctx.dest,
      dest_name:     ctx.destName,
      date:          ctx.date,
      etd:           ctx.etd,
      eta:           ctx.eta,
      briefing_time: ctx.briefingTime,
      dep_runway:    ctx.depRunway,
      dest_runway:   ctx.destRunway,
      cruise:        ctx.cruiseLevels,
      alternates:    ctx.alts,
      edto:          ctx.edto,
    },
    departure:   buildAirportWx(sec.departure, ctx.dep.split('/')[0]),
    destination: buildAirportWx(sec.destination, ctx.dest.split('/')[0]),
    alternates:  ctx.alts.map(icao => buildAirportWx(sec.alternate, icao)),
    edto:        ctx.edto.map(icao => buildAirportWx(sec.edto, icao)),
    // SIGMETs kept as raw text — no parser for these
    sigmets_raw: sec.sigmets.slice(0, 5000),
    winds_raw:   sec.winds.slice(0, 5000),
  };

  return JSON.stringify(payload, null, 2);
}
