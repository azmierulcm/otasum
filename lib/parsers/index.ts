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
  const callsign    = get(raw, /^([A-Z]+\s+\d+)\s+OFP/m) ?? 'N/A';
  const airlineIcao = get(raw, /^([A-Z]+)\s+\d+\s+OFP/m) ?? 'N/A';
  const acType      = get(raw, /^([A-Z]\d{3}[A-Z]?)\s+\w+\/\w+\s+\d{4}\s+UTC/m) ?? 'N/A';
  const acCategory  = AC_CATEGORY[acType] ?? 'Cat C/D';

  // ── Route header ──────────────────────────────────────────────────────────
  const routeHdr = raw.match(/^[A-Z]\d{3}[A-Z]?\s+(\w+\/\w+)\s+(\d{4})\s+UTC\s+(\w+\/\w+)\s+(\d{4})\s+UTC/m);
  const dep       = routeHdr?.[1] ?? 'N/A';
  const etdRaw    = routeHdr?.[2] ?? '0000';
  const dest      = routeHdr?.[3] ?? 'N/A';
  const etaRaw    = routeHdr?.[4] ?? '0000';
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
  const routeBodyM = raw.match(/DEFRTE\s*\n([\s\S]+?)(?=\nTAKEOFF ALTN:|\n3%\s+ERA:|\nMEL\s*\/)/i);
  const routeString = routeBodyM
    ? routeBodyM[1].split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 3).join(' ')
    : 'N/A';

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
  let altM: RegExpExecArray | null;
  while ((altM = altRe.exec(raw)) !== null) {
    const icao = altM[1];
    if (icao !== depIcao && icao !== destIcao) altSet.add(icao);
  }
  const alts = Array.from(altSet).slice(0, 6);

  // ── EDTO en-route alternates ──────────────────────────────────────────────
  const edtoBlock = raw.match(/ENRTE\s+ALTNS\s*\([^)]+\)([\s\S]+?)(?=\n-{10,}|\nEDTO\s+INFO)/i)?.[1] ?? '';
  const edtoRe    = /^([A-Z]{4})\s+[\d:]+/gm;
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
  const wxStart  = raw.search(/\nWeather\n/);
  const crewEnd  = raw.indexOf('Crew Information');
  if (wxStart < 0) return '[Weather section not found in document]';
  const end = crewEnd > wxStart ? crewEnd : wxStart + 25000;

  // Prepend upper winds table (before weather section) for segmented analysis
  const windIdx   = raw.indexOf('WIND INFORMATION');
  const windBlock = windIdx > 0 && windIdx < wxStart
    ? '\n=== UPPER WINDS TABLE ===\n' + raw.slice(windIdx, wxStart).slice(0, 15000)
    : '';

  return windBlock + '\n=== WEATHER PACKAGE ===\n' + raw.slice(wxStart, end);
}

export function extractNotamSection(raw: string): string {
  const notamStart = raw.search(/\nNOTAM[S]?\n/);
  if (notamStart < 0) return '[NOTAM section not found in document]';

  const block = raw.slice(notamStart, notamStart + 60000);

  // Find where ICAO NOTAMs start (pattern: ICAO-prefixed refs like A1234/26 or WMKK A1234/26)
  const icaoIdx = block.search(/\n[A-Z]{4}\s+[A-Z]\d{4}\/\d{2}|\n[A-Z]\d{4}\/\d{2}\s+NOTAM/);
  if (icaoIdx > 500) {
    // Return company NOTAMs too — spec says keep if operationally significant
    return block.slice(0, icaoIdx + 40000);
  }

  return block.slice(0, 50000);
}
