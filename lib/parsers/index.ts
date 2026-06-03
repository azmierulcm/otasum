import { parseOfpCore } from './ofpCore';
import { parseWindshear } from './windshear';
import { parseEdto } from './edto';
import { parseFuelComparison } from './fuelComparison';
import type { FlightContext } from '@/lib/systemPrompt';

export interface LocalParserResult {
  ofp: string;
  windshear: string;
  edto: string;
  fuel: string;
}

export function runLocalParsers(rawText: string): LocalParserResult {
  return {
    ofp:       parseOfpCore(rawText),
    windshear: parseWindshear(rawText),
    edto:      parseEdto(rawText),
    fuel:      parseFuelComparison(rawText),
  };
}

// ── Lookup tables ────────────────────────────────────────────────────────────

const AIRPORT_NAMES: Record<string, string> = {
  WMKK: 'Kuala Lumpur International (KLIA)',
  EGLL: 'London Heathrow',
  EGBB: 'Birmingham',
  EGKK: 'London Gatwick',
  EGCC: 'Manchester International',
  EGSS: 'London Stansted',
  VTBS: 'Bangkok Suvarnabhumi',
  VECC: 'Kolkata (Netaji SC Bose)',
  VOHS: 'Hyderabad (Rajiv Gandhi)',
  VILK: 'Lucknow (Chaudhary Charan Singh)',
  VIDP: 'Delhi (Indira Gandhi)',
  VAAH: 'Ahmedabad (Sardar Vallabhbhai Patel)',
  OPKC: 'Karachi (Jinnah)',
  OPIS: 'Islamabad',
  UTDD: 'Dushanbe',
  UTAA: 'Ashgabat',
  UBBB: 'Baku (Heydar Aliyev)',
  LTAC: 'Ankara (Esenboğa)',
  LTFM: 'Istanbul',
  LHBP: 'Budapest (Ferenc Liszt)',
  LOWW: 'Vienna (Schwechat)',
  EDDF: 'Frankfurt',
  EBBR: 'Brussels',
  EGPF: 'Glasgow',
  EIDW: 'Dublin',
  LEMD: 'Madrid (Barajas)',
  LFPG: 'Paris (Charles de Gaulle)',
};

const AC_CATEGORY: Record<string, string> = {
  A359: 'Cat D', A35K: 'Cat D', A388: 'Cat D',
  B789: 'Cat D', B788: 'Cat C/D', B77W: 'Cat D',
  B744: 'Cat D', B748: 'Cat D',
  A333: 'Cat C/D', A332: 'Cat C/D',
  A321: 'Cat C', A320: 'Cat C', A319: 'Cat B/C',
  B738: 'Cat C', B737: 'Cat C',
};

// ── Helper ───────────────────────────────────────────────────────────────────

function get(text: string, re: RegExp, g = 1): string | null {
  return text.match(re)?.[g] ?? null;
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getAny(text: string, patterns: RegExp[], group = 1): string | null {
  const flat = compact(text);
  for (const pattern of patterns) {
    const match = text.match(pattern) ?? flat.match(pattern);
    if (match?.[group]) return match[group].trim();
  }
  return null;
}

interface RouteHeader {
  acType: string;
  dep: string;
  etdRaw: string;
  dest: string;
  etaRaw: string;
  destAlt: string;
}

function parseRouteHeader(raw: string): RouteHeader | null {
  const match = getAny(raw, [
    /\b([A-Z]\d{3}[A-Z]?)\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\b/i,
    /\b([A-Z]\d{3}[A-Z]?)\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\b/i,
  ], 0);

  const parts = match?.match(/\b([A-Z]\d{3}[A-Z]?)\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC(?:\s+([A-Z]{4}\/[A-Z0-9]{2,4}))?/i);
  if (!parts) return null;

  return {
    acType: parts[1],
    dep: parts[2],
    etdRaw: parts[3],
    dest: parts[4],
    etaRaw: parts[5],
    destAlt: parts[6] ?? 'N/A',
  };
}

function extractRouteString(raw: string): string {
  const route = getAny(raw, [
    /ROUTE\s*\/\s*FLT\s+LVL\s*:\s*ROUTE:\s*\S+\s+\S+\s+DEFRTE\s+([\s\S]+?)(?=\s+(?:TAKEOFF\s+ALTN:|3%\s+ERA:|MEL\s*\/|SPECIAL\s+NOTES:))/i,
    /\bDEFRTE\s+([\s\S]+?)(?=\s+(?:TAKEOFF\s+ALTN:|3%\s+ERA:|MEL\s*\/|SPECIAL\s+NOTES:|FUEL\s+ORDER|LIDO\s+TAKE-OFF))/i,
  ]);

  return route
    ? route.replace(/\s+/g, ' ').trim()
    : 'N/A';
}

function sectionBetween(text: string, startRe: RegExp, endRes: RegExp[]): string {
  const start = text.search(startRe);
  if (start < 0) return '';

  const tail = text.slice(start);
  const end = endRes
    .map((re) => {
      const idx = tail.slice(1).search(re);
      return idx < 0 ? null : idx + 1;
    })
    .filter((idx): idx is number => idx !== null)
    .sort((a, b) => a - b)[0];

  return (end ? tail.slice(0, end) : tail).trim();
}

function routeFirCodes(raw: string): Set<string> {
  const wxStart = raw.search(/(?:^|\n)\s*Weather\s*(?:\n|$)/i);
  const preWeather = raw.slice(0, wxStart > 0 ? wxStart : Math.min(raw.length, 90000));
  const codes = new Set<string>();
  const re = /^([A-Z0-9]{4})\s{2,}[A-Z][A-Z\s()/.-]*\bFIR\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(preWeather)) !== null) codes.add(m[1]);
  return codes;
}

function notamSectionsForCodes(block: string, codes: Set<string>, maxChars: number, maxSectionChars: number): string {
  if (codes.size === 0) return '';

  const lines = block.split('\n');
  const sections: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].trim().match(/^([A-Z0-9]{4})\s{2,}.+/);
    if (!heading || !codes.has(heading[1])) continue;

    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const nextHeading = lines[j].trim().match(/^([A-Z0-9]{3,5})\s{2,}.+/);
      const nextDashed = lines[j + 1]?.trim().startsWith('---');
      if (nextHeading && nextDashed) {
        end = j;
        break;
      }
    }

    let section = lines.slice(i, end).join('\n').trim();
    if (section.length > maxSectionChars) {
      section = section.slice(0, maxSectionChars) + '\n[Section truncated for AI input size]';
    }
    sections.push(section);
  }

  let joined = sections.filter(Boolean).join('\n\n');
  if (joined.length > maxChars) joined = joined.slice(0, maxChars) + '\n\n[ENROUTE NOTAM section truncated for AI input size]';
  return joined;
}

/** Convert Lido date "02 JUN 2026" + time "1530" → ISO "2026-06-02T15:30Z" */
function toIso(dateStr: string, timeHHMM: string): string {
  const MONTHS: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length < 3) return 'N/A';
  const [dd, mon, yyyy] = parts;
  const mm = MONTHS[mon] ?? '01';
  const hh = timeHHMM.slice(0, 2);
  const mn = timeHHMM.slice(2, 4);
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}T${hh}:${mn}Z`;
}

/** If ETA time (HHMM) < ETD time (HHMM), ETA is next calendar day */
function etaIso(dateStr: string, etdHHMM: string, etaHHMM: string): string {
  const etdMin = parseInt(etdHHMM.slice(0, 2)) * 60 + parseInt(etdHHMM.slice(2));
  const etaMin = parseInt(etaHHMM.slice(0, 2)) * 60 + parseInt(etaHHMM.slice(2));

  const MONTHS: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length < 3) return 'N/A';

  const date = new Date(
    Date.UTC(
      parseInt(parts[2]),
      (MONTHS[parts[1]] ?? 1) - 1,
      parseInt(parts[0])
    )
  );
  if (etaMin < etdMin) date.setUTCDate(date.getUTCDate() + 1);

  const yr = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(date.getUTCDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}T${etaHHMM.slice(0, 2)}:${etaHHMM.slice(2)}Z`;
}

// ── Flight context extraction ─────────────────────────────────────────────────

export function extractFlightContext(raw: string): FlightContext {
  // ── Identity ───────────────────────────────────────────────────────────────
  const routeHdr    = parseRouteHeader(raw);
  const callsign    = getAny(raw, [
    /^([A-Z]+\s+\d+)\s+OFP/m,
    /\b([A-Z]{2,4}\s*\d{1,4})\s+OFP\b/i,
  ]) ?? 'N/A';
  const airlineIcao = getAny(raw, [
    /^([A-Z]+)\s+\d+\s+OFP/m,
    /\b([A-Z]{2,4})\s*\d{1,4}\s+OFP\b/i,
  ]) ?? 'N/A';
  const acType      = routeHdr?.acType ?? getAny(raw, [
    /^([A-Z]\d{3}[A-Z]?)\s+\w+\/\w+\s+\d{4}\s+UTC/m,
    /\b([A-Z]\d{3}[A-Z]?)\s+[A-Z]{4}\/[A-Z0-9]{2,4}\s+\d{4}\s+UTC/i,
  ]) ?? 'N/A';
  const acCategory  = AC_CATEGORY[acType] ?? 'Cat C/D';

  // ── Route header ──────────────────────────────────────────────────────────
  const dep       = routeHdr?.dep ?? 'N/A';
  const etdRaw    = routeHdr?.etdRaw ?? '0000';
  const dest      = routeHdr?.dest ?? 'N/A';
  const etaRaw    = routeHdr?.etaRaw ?? '0000';
  const depIcao   = dep.split('/')[0];
  const destIcao  = dest.split('/')[0];
  const depName   = AIRPORT_NAMES[depIcao] ?? depIcao;
  const destName  = AIRPORT_NAMES[destIcao] ?? destIcao;

  // ── Date ──────────────────────────────────────────────────────────────────
  const date = get(raw, /(\d{2}\s+[A-Z]{3}\s+\d{4})/) ?? '';

  // ── ISO datetimes ─────────────────────────────────────────────────────────
  const etdIso  = date ? toIso(date, etdRaw) : 'N/A';
  const etaIsoV = date ? etaIso(date, etdRaw, etaRaw) : 'N/A';

  // ── Full route string ─────────────────────────────────────────────────────
  const routeString = extractRouteString(raw);

  // ── SID: second token after DEP ICAO that matches SID pattern ────────────
  const routeParts = routeString.split(/\s+/);
  const sidCandidate = routeParts[1] ?? '';
  const depSid = /^[A-Z]{3,6}\d[A-Z]?$/.test(sidCandidate) ? sidCandidate : 'N/A';

  // ── Cruise levels ─────────────────────────────────────────────────────────
  const stepRaw = get(raw, /([A-Z]{2,}\/F\d{3}(?:\s+[A-Z]{2,}\/F\d{3})+)/);
  const cruiseLevels = stepRaw
    ? stepRaw.replace(/[A-Z]{2,}\/F(\d{3})/g, 'FL$1').replace(/\s+/g, ' → ')
    : 'N/A';
  const flNums = Array.from(raw.matchAll(/\/F(\d{3})/g)).map(m => parseInt(m[1]));
  const peakCruise = flNums.length ? `FL${Math.max(...flNums)}` : 'N/A';

  // ── Alternate airports from FMS INFO alternate table ──────────────────────
  const altRe  = /^([A-Z]{4})\s+\d{3}\s+\d+\s+\S/gm;
  const altSet = new Set<string>();
  const destAltIcao = routeHdr?.destAlt?.split('/')[0];
  if (destAltIcao && destAltIcao !== 'N/A') altSet.add(destAltIcao);
  let altM: RegExpExecArray | null;
  while ((altM = altRe.exec(raw)) !== null) {
    const icao = altM[1];
    if (icao !== depIcao && icao !== destIcao) altSet.add(icao);
  }
  const alts = Array.from(altSet).slice(0, 6);

  // ── EDTO en-route alternates ──────────────────────────────────────────────
  const edtoBlock = raw.match(/ENRTE\s+ALTNS\s*\([^)]+\)([\s\S]+?)(?=\n\s*(?:Page\s+\d+|Weather|LIDO\s+TAKE|WPT\s+|TERRAIN|[-]{5,}))/i)?.[1] ?? '';
  const edtoRe    = /^([A-Z]{4})\s+\d{2}:\d{2}\s+\d{2}:\d{2}\s+WX\s+MIN:/gm;
  const edtoSet   = new Set<string>();
  let edtoM: RegExpExecArray | null;
  while ((edtoM = edtoRe.exec(edtoBlock)) !== null) edtoSet.add(edtoM[1]);
  const edto = Array.from(edtoSet);

  // ── Briefing time ─────────────────────────────────────────────────────────
  const briefDate = get(raw, /LIDO\/WEATHER SERVICE\s+DATE\s*:\s*(\S+)/i);
  const briefTime = get(raw, /LIDO\/WEATHER SERVICE\s+DATE[^T\n]+TIME\s*:\s*(\S+)/i);
  const briefingTime = briefDate && briefTime
    ? `${briefTime}Z ${briefDate}`
    : date ? `N/A (use ${date})` : 'N/A';

  // ── Runway assignments ────────────────────────────────────────────────────
  const depRunway  = get(raw, /DEP\s+A\/D\s+RWY:\s+(\S+)/)?.split('-')[0] ?? 'N/A';
  const destRunway = get(raw, /DEST\s+A\/D\s+RWY:\s+(\S+)/) ?? 'N/A';

  return {
    callsign,
    airlineIcao,
    acType,
    acCategory,
    dep,
    dest,
    depName,
    destName,
    alts,
    edto,
    routeString,
    date,
    etd: `${etdRaw.slice(0, 2)}:${etdRaw.slice(2)}Z`,
    eta: `${etaRaw.slice(0, 2)}:${etaRaw.slice(2)}Z`,
    etdIso,
    etaIso: etaIsoV,
    briefingTime,
    depRunway,
    depSid,
    destRunway,
    cruiseLevels,
    peakCruise,
  };
}

// ── Section extractors ────────────────────────────────────────────────────────

export function extractWxSection(raw: string): string {
  const wxStart  = raw.search(/(?:^|\n)\s*Weather\s*(?:\n|$)/i);
  const crewEnd  = raw.slice(wxStart > -1 ? wxStart : 0).search(/(?:^|\n)\s*Crew Information\s*(?:\n|$)/i);
  if (wxStart < 0) return '[Weather section not found in document]';
  const end = crewEnd > 0 ? wxStart + crewEnd : wxStart + 35000;
  const wxBlock = raw.slice(wxStart, end);

  // Prepend upper winds table (before weather section) for segmented analysis
  const windIdx   = raw.search(/WIND INFORMATION/i);
  const windBlock = windIdx > 0 && windIdx < wxStart
    ? '\n=== UPPER WINDS TABLE ===\n' + raw.slice(windIdx, wxStart).slice(0, 18000)
    : '';

  const selectedWeather = [
    sectionBetween(wxBlock, /LIDO\/WEATHER SERVICE/i, [/AIRMETs:/i]),
    sectionBetween(wxBlock, /AIRMETs:/i, [/DESTINATION AIRPORT:/i]),
    sectionBetween(wxBlock, /DESTINATION AIRPORT:/i, [/DESTINATION ALTERNATE:/i]),
    sectionBetween(wxBlock, /DESTINATION ALTERNATE:/i, [/ENROUTE AIRPORT\(S\):/i]),
    sectionBetween(wxBlock, /CRITICAL EDTO AIRPORTS:/i, [/ESCAPE AIRPORT\(S\):/i]),
    sectionBetween(wxBlock, /DEPARTURE AIRPORT:/i, [/Space Weather Advisory:/i]),
    sectionBetween(wxBlock, /Space Weather Advisory:/i, [/AIRPORTLIST ENDED/i]),
  ].filter(Boolean).join('\n\n');

  return windBlock + '\n=== WEATHER PACKAGE (TARGETED) ===\n' + (selectedWeather || wxBlock);
}

export function extractNotamSection(raw: string): string {
  const notamStart = raw.search(/(?:^|\n)\s*NOTAM[S]?\s*(?:\n|$)/i);
  if (notamStart < 0) return '[NOTAM section not found in document]';

  const afterStart = raw.slice(notamStart);
  const bulletinEnd = afterStart.search(/END OF LIDO-NOTAM-BULLETIN/i);
  const block = afterStart.slice(0, bulletinEnd > 0 ? bulletinEnd : Math.min(afterStart.length, 180000));
  const firCodes = routeFirCodes(raw);
  const targeted = [
    sectionBetween(block, /LIDO-NOTAM-BULLETIN/i, [/DEPARTURE AIRPORT/i]),
    sectionBetween(block, /DEPARTURE AIRPORT/i, [/DESTINATION AIRPORT/i]),
    sectionBetween(block, /DESTINATION AIRPORT/i, [/DESTINATION ALTERNATE\(S\)/i]),
    sectionBetween(block, /DESTINATION ALTERNATE\(S\)/i, [/(?:^|\n)EDTO SUITABLE ENROUTE AIRPORT\(S\)/i, /(?:^|\n)ENROUTE AIRPORT\(S\):?/i]),
    sectionBetween(block, /(?:^|\n)EDTO SUITABLE ENROUTE AIRPORT\(S\)/i, [/(?:^|\n)ENROUTE AIRPORT\(S\):?/i]),
    notamSectionsForCodes(
      sectionBetween(block, /(?:^|\n)ENROUTE AIRPORT\(S\):?/i, [/EXTENDED AREA AROUND DESTINATION ALTERNATE AIRPORT\(S\)/i, /END OF LIDO-NOTAM-BULLETIN/i]),
      firCodes,
      65000,
      3500,
    ),
  ].filter(Boolean).join('\n\n');

  return targeted.trim() || block.slice(0, 120000).trim();
}
