/**
 * weatherParser.ts
 *
 * Uses metar-taf-parser to extract and structure METAR/TAF data from the
 * Lido OFP weather section before sending to the AI.
 *
 * Key improvements over raw text approach:
 *  - Input tokens: ~15,000 chars → ~2,500 compact JSON
 *  - Data pre-validated — AI just formats, doesn't parse
 *  - Enables Haiku instead of Sonnet
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

/**
 * Split the labelled === SECTION === output from extractWxSection.
 * Falls back gracefully when no labels are present (raw wxBlock fallback).
 */
export function splitWxSections(wxText: string): WxSections {
  const get = (label: string): string => {
    // Match === LABEL === followed by content (flexible spacing)
    const re = new RegExp(`===\\s*${label}\\s*===([\\s\\S]+?)(?===\\s*[A-Z]|$)`, 'i');
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

// ── METAR / TAF string extraction ─────────────────────────────────────────────

/**
 * Extract a complete METAR string for a given ICAO.
 * Handles:
 *  - Multi-line METARs (Lido wraps long METARs)
 *  - With/without METAR/SPECI prefix
 *  - = terminator or end-of-section
 */
function extractMetarRaw(text: string, icao: string): string | null {
  if (!text) return null;

  // Pattern 1: With METAR/SPECI prefix — capture to = terminator (may span lines)
  const withPrefix = new RegExp(
    `(?:METAR|SPECI)\\s+${icao}\\s+\\d{6}Z[\\s\\S]{5,400}?(?:=|\\n(?:\\s*\\n|Forecast|TAF\\s|[A-Z]{4}\\s+\\d{6}Z))`,
    'i',
  );

  // Pattern 2: Without prefix — ICAO DDHHMMZ winds ...
  const withoutPrefix = new RegExp(
    `${icao}\\s+\\d{6}Z\\s+(?:AUTO\\s+|COR\\s+)?(?:(?:\\d{3}|VRB)\\d{2}(?:G\\d{2})?(?:KT|MPS))[\\s\\S]{5,300}?(?:=|\\n\\s*\\n)`,
    'i',
  );

  for (const re of [withPrefix, withoutPrefix]) {
    const m = text.match(re);
    if (m) {
      return m[0]
        .replace(/=\s*$/, '')          // strip = terminator
        .replace(/\n\s*/g, ' ')        // collapse multi-line into single line
        .replace(/\s{2,}/g, ' ')       // normalise spaces
        .trim();
    }
  }
  return null;
}

/**
 * Extract a complete TAF string for a given ICAO.
 * Captures multi-line TAF blocks up to the = terminator.
 */
function extractTafRaw(text: string, icao: string): string | null {
  if (!text) return null;

  // Capture TAF from "TAF [AMD/COR] ICAO DDHHMMZ" to = terminator
  const withEquals = new RegExp(
    `TAF\\s+(?:AMD\\s+|COR\\s+)?${icao}\\s+\\d{6}Z[\\s\\S]+?=`,
    'i',
  );

  // Fallback: TAF until double newline or next section
  const withoutEquals = new RegExp(
    `TAF\\s+(?:AMD\\s+|COR\\s+)?${icao}\\s+\\d{6}Z[\\s\\S]+?(?=\\n\\n|\\n[A-Z]{4}\\s+\\d{6}Z|\\nMETAR\\s|$)`,
    'i',
  );

  const m = text.match(withEquals) ?? text.match(withoutEquals);
  return m ? m[0].replace(/=\s*$/, '').trim() : null;
}

// ── Compact serialisers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactMetar(m: any): object {
  return {
    time:   m.day != null
      ? `${m.day}${String(m.hour ?? 0).padStart(2, '0')}${String(m.minute ?? 0).padStart(2, '0')}Z`
      : null,
    wind:   m.wind ? {
      dir:   m.wind.degrees ?? m.wind.direction,
      speed: m.wind.speed,
      gust:  m.wind.gust ?? null,
      unit:  m.wind.unit,
    } : null,
    vis:    m.visibility?.value ?? null,
    wx:     (m.weatherConditions ?? []).map((w: any) => w.phenomenon ?? w).filter(Boolean),
    clouds: (m.clouds ?? []).map((c: any) => ({
      qty:    c.quantity,
      height: c.height ?? null,
      type:   c.type   ?? null,
    })),
    temp:  m.temperature ?? null,
    dew:   m.dewPoint    ?? null,
    qnh:   m.altimeter?.value ?? null,
    nosig: m.nosig ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactTaf(t: any): object {
  const fmtV = (v: any) =>
    v ? `${v.startDay}${String(v.startHour ?? 0).padStart(2, '0')}Z/${v.endDay}${String(v.endHour ?? 0).padStart(2, '0')}Z` : null;

  return {
    valid:  fmtV(t.validity),
    trends: (t.trends ?? []).map((tr: any) => ({
      type:   tr.type ?? null,
      valid:  fmtV(tr.validity),
      prob:   tr.probability ?? null,
      wind:   tr.wind ? {
        dir:   tr.wind.degrees ?? tr.wind.direction,
        speed: tr.wind.speed,
        gust:  tr.wind.gust ?? null,
        unit:  tr.wind.unit,
      } : null,
      vis:    tr.visibility?.value ?? null,
      wx:     (tr.weatherConditions ?? []).map((w: any) => w.phenomenon ?? w).filter(Boolean),
      clouds: (tr.clouds ?? []).map((c: any) => ({
        qty:    c.quantity,
        height: c.height ?? null,
        type:   c.type   ?? null,
      })),
    })),
  };
}

// ── Per-airport builder ───────────────────────────────────────────────────────

interface AirportWx {
  icao:      string;
  metar_raw: string;
  metar?:    object;
  taf_raw:   string;
  taf?:      object;
}

/**
 * Build weather data for one airport.
 * Tries section-specific text first, then falls back to the full wxText
 * so data is never missed even when section labelling fails.
 */
function buildAirportWx(section: string, icao: string, fullText: string): AirportWx {
  // Try section first, then full text as fallback
  const metarRaw =
    extractMetarRaw(section, icao) ??
    extractMetarRaw(fullText, icao) ?? '';

  const tafRaw =
    extractTafRaw(section, icao) ??
    extractTafRaw(fullText, icao) ?? '';

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
 * Parse weather data from the OFP weather section and return compact JSON
 * ready to be sent to the AI (~2,500 chars vs 15,000 raw chars).
 */
export function buildCompactWeatherPayload(wxText: string, ctx: FlightContext): string {
  const sec = splitWxSections(wxText);

  // Pass full wxText as fallback for every airport lookup
  const full = wxText;

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
    departure:   buildAirportWx(sec.departure,   ctx.dep.split('/')[0],  full),
    destination: buildAirportWx(sec.destination, ctx.dest.split('/')[0], full),
    alternates:  ctx.alts.map(icao => buildAirportWx(sec.alternate, icao, full)),
    edto:        ctx.edto.map(icao => buildAirportWx(sec.edto,      icao, full)),
    sigmets_raw: sec.sigmets.slice(0, 5000) || wxText.slice(0, 3000),
    winds_raw:   sec.winds.slice(0, 5000),
  };

  return JSON.stringify(payload, null, 2);
}
