import { parseFuel, kgFmt, orNA, FuelEntry } from './utils';

// ── Small helpers ────────────────────────────────────────────────────────────

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

function digits(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned) : null;
}

interface RouteHeader {
  acType: string;
  dep: string;
  depTime: string;
  dest: string;
  destTime: string;
  destAlt: string;
}

function parseRouteHeader(raw: string): RouteHeader | null {
  const match = getAny(raw, [
    /\b([A-Z]\d{3}[A-Z]?)\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\b/i,
    /\b([A-Z]\d{3}[A-Z]?)\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\b/i,
  ], 0);

  if (!match) return null;

  const parts = match.match(/\b([A-Z]\d{3}[A-Z]?)\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC\s+([A-Z]{4}\/[A-Z0-9]{2,4})\s+(\d{4})\s+UTC(?:\s+([A-Z]{4}\/[A-Z0-9]{2,4}))?/i);
  if (!parts) return null;

  return {
    acType: parts[1],
    dep: parts[2],
    depTime: parts[3],
    dest: parts[4],
    destTime: parts[5],
    destAlt: parts[6] ?? 'N/A',
  };
}

function extractRoute(raw: string): string {
  const route = getAny(raw, [
    /DEFRTE\s+([\s\S]+?)(?=\s+(?:TAKEOFF\s+ALTN:|3%\s+ERA:|MEL\s*\/|FUEL\s+ORDER|LIDO\s+TAKEOFF|OFP\s+FUEL))/i,
  ]);
  if (!route) return 'N/A';
  return route
    .split(/\n/)
    .map(l => l.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Break a space-separated route string into wrapped lines of N waypoints each */
function fmtRoute(raw: string, perLine = 6): string {
  if (!raw || raw === 'N/A') return 'N/A';
  const parts = raw.trim().split(/\s+/);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += perLine) {
    lines.push(parts.slice(i, i + perLine).join(' '));
  }
  return lines.join('\n');
}

function sliceFrom(flat: string, startRe: RegExp, endRes: RegExp[]): string {
  const start = flat.search(startRe);
  if (start < 0) return '';

  const afterStart = flat.slice(start);
  const end = endRes
    .map((re) => {
      const idx = afterStart.slice(1).search(re);
      return idx < 0 ? null : idx + 1;
    })
    .filter((idx): idx is number => idx !== null)
    .sort((a, b) => a - b)[0];

  return end ? afterStart.slice(0, end) : afterStart;
}

function perfValue(block: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return get(block, new RegExp(`${escaped}\\s*:\\s*([^\\s|]+)`, 'i'));
}

/** Insert hyphen into registration: 9MMAG → 9M-MAG, GMCKO → G-MCKO */
function fmtReg(raw: string): string {
  if (!raw) return 'N/A';
  return /^\d/.test(raw)
    ? `${raw.slice(0, 2)}-${raw.slice(2)}`
    : `${raw[0]}-${raw.slice(1)}`;
}

/** P31 → +31°C  M05 → -05°C  P00 → ±0°C */
function fmtTemp(raw: string | null): string {
  if (!raw) return 'N/A';
  if (/^\d+$/.test(raw)) return `${raw}°C`;
  return raw.replace(/^P/, '+').replace(/^M/, '-') + '°C';
}

/** Expand known ICAO type codes to full names */
const AC_TYPES: Record<string, string> = {
  A359: 'A359 (Airbus A350-900)', A35K: 'A35K (Airbus A350-1000)',
  A388: 'A388 (Airbus A380-800)', A333: 'A333 (Airbus A330-300)',
  A332: 'A332 (Airbus A330-200)', A321: 'A321 (Airbus A321)',
  B789: 'B789 (Boeing 787-9)',    B788: 'B788 (Boeing 787-8)',
  B77W: 'B77W (Boeing 777-300ER)',B744: 'B744 (Boeing 747-400)',
};
const expandType = (c: string | null) => (c && AC_TYPES[c]) ? AC_TYPES[c] : orNA(c);

/** WMKK/F340 KAGUL/F360 ... → WMKK → FL340 → KAGUL/FL360 → ... → EGLL */
function fmtStepClimb(raw: string | null, dest: string): string {
  if (!raw) return 'N/A';
  const result = raw.trim().split(/\s+/).map((p, i) => {
    const m = p.match(/^(\w+)\/F(\d{3})$/);
    if (!m) return p;
    return i === 0 ? `${m[1]} → FL${m[2]}` : `→ ${m[1]}/FL${m[2]}`;
  });
  return result.join(' ') + ` → ${dest}`;
}

/** Fuel table row: | label | kg | time | */
function fRow(label: string, e: FuelEntry | null, note = ''): string {
  const lbl = note ? `${label} *(${note})*` : label;
  return `| ${lbl} | ${e ? `${e.kg.toLocaleString()} kg` : 'N/A'} | ${e?.time ?? '—'} |`;
}

// ── Decision Point parser ────────────────────────────────────────────────────

interface DP { wpt: string; dist: string; prior: string; after: string; }

function keyApt(text: string): string {
  if (/NEAREST SUITABLE|INCLUDING DEPARTURE/i.test(text)) {
    const m = text.match(/DEPARTURE\s*-\s*(\w+\/\w+)/i);
    return m ? `RTB → ${m[1]}` : 'RTB (DEP)';
  }
  const apts = text.match(/\b([A-Z]{4}\/[A-Z]{2,4})\b/g) ?? [];
  return apts.length ? apts[apts.length - 1] : text.replace(/\s+/g, ' ').slice(0, 40).trim();
}

function parseDPs(raw: string): DP[] {
  const out: DP[] = [];
  const re = /\*\*\* DP - (\w+) PLUS (\d+) NM \*\*\*([\s\S]+?)(?=\*\*\* DP |-{40,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const body      = m[3];
    const priorFull = body.match(/PRIOR TO DECISION POINT([\s\S]+?)(?=AFTER DECISION POINT)/i)?.[1] ?? '';
    const afterFull = body.match(/AFTER DECISION POINT([\s\S]+?)$/i)?.[1] ?? '';
    out.push({ wpt: m[1], dist: m[2], prior: keyApt(priorFull), after: keyApt(afterFull) });
  }
  return out;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseOfpCore(raw: string): string {

  // ── Flight ID ─────────────────────────────────────────────────────────────
  const routeHdr  = parseRouteHeader(raw);
  const flightNum = getAny(raw, [
    /^([A-Z]+\s+\d+)\s+OFP\s+/m,
    /\b([A-Z]{2,4}\s*\d{1,4})\s+OFP\b/i,
  ]);
  const ofpNum    = getAny(raw, [
    /OFP\s+([\d\/]+)\s+\(/,
    /\bOFP\s+([\d\/]+)\b/i,
  ]);
  const date      = get(raw, /(\d{2}\s+[A-Z]{3}\s+\d{4})/);
  const reg       = fmtReg(getAny(raw, [
    /^([A-Z0-9]{5})\s+DEP:/m,
    /\b([A-Z0-9]{5})\s+DEP\s*:/i,
  ]) ?? '');
  const acType    = expandType(routeHdr?.acType ?? getAny(raw, [
    /^([A-Z]\d{3}[A-Z]?)\s+\w+\/\w+\s+\d{4}\s+UTC/m,
    /\b([A-Z]\d{3}[A-Z]?)\s+[A-Z]{4}\/[A-Z0-9]{2,4}\s+\d{4}\s+UTC/i,
  ]));

  const dep       = routeHdr?.dep ?? 'N/A';
  const depTime   = routeHdr?.depTime ?? 'N/A';
  const dest      = routeHdr?.dest ?? 'N/A';
  const destTime  = routeHdr?.destTime ?? 'N/A';
  const destAlt   = routeHdr?.destAlt ?? 'N/A';
  const destIcao  = dest.split('/')[0] ?? 'DEST';

  const timesM  = raw.match(/(\d{2}:\d{2})\s+HRS\s+(\d{2}:\d{2})\s+HRS/);
  const blkTime = timesM?.[1] ?? 'N/A';
  const fltTime = timesM?.[2] ?? 'N/A';

  const fullRoute = extractRoute(raw);

  // ── Fuel ──────────────────────────────────────────────────────────────────
  const trip      = parseFuel(raw, 'TRIP');
  const cont      = parseFuel(raw, 'CONT');
  const altn      = parseFuel(raw, 'ALTN');
  const finalRsv  = parseFuel(raw, 'FINAL RSV');
  const edtoAddnl = parseFuel(raw, 'EDTO / ADDNL');
  const atcHold   = parseFuel(raw, 'ATC HOLD');
  const minSector = parseFuel(raw, 'MINIMUM SECTOR FUEL');
  const toffFuel  = parseFuel(raw, 'T/OFF FUEL') ?? parseFuel(raw, 'EST T/OFF FUEL');
  const taxi      = parseFuel(raw, 'TAXI');
  const block     = parseFuel(raw, 'BLOCK FUEL');
  const mdf       = parseFuel(raw, 'MIN DIV FUEL');
  const altnApt   = get(raw, /\bALTN\s+(\w{3})\s+\d{4,6}/) ?? '';
  const possExtra = get(raw, /POSS\s+EXTRA\s+(\d+)T/i);


  // ── Weights ───────────────────────────────────────────────────────────────
  const zfwM  = raw.match(/ZFW\s+(\d{5,6})\s+(\d{5,6})/);
  const towM  = raw.match(/TOW\s+(\d{5,6})\s+(\d{5,6})/);
  const ldwM  = raw.match(/LDW\s+(\d{5,6})\s+(\d{5,6})/);
  const pf    = get(raw, /PER\s+FACTOR\s+(\w+)/i);
  const rtowA = get(raw, /RTOW\s+(\d{5,6})\s*\(A\)/);
  const rtowB = get(raw, /RTOW\s*\(PERF\)\s+(\d{5,6})\s*\(B\)/i);

  const towMargin = (towM && +towM[2] && +towM[1]) ? +towM[2] - +towM[1] : null;
  const ldwMargin = (ldwM && +ldwM[2] && +ldwM[1]) ? +ldwM[2] - +ldwM[1] : null;

  // ── Enroute metrics ───────────────────────────────────────────────────────
  const dispatcher = get(raw, /DISPATCHER:\s+(.+)/);
  const license    = get(raw, /LICENSE\s+NO:\s+(\S+)/i);
  const ci         = get(raw, /FMS\s+COST\s+INDEX:\s+(\S+)/i);
  const grdDist    = get(raw, /GRD\s+DIST:(\d+)/);
  const esad       = get(raw, /AIR\s+DIST:(\d+)/);
  const avgWC      = get(raw, /AVG\s+W\/C:([MP]\d+)/);
  const avgISA     = get(raw, /AVG\s+ISA:([PM]\d+)/);
  const ffFactor   = get(raw, /FF\s+FACTOR:([PM][\d.]+)/i);
  const edtoRule   = get(raw, /EDTO\s+RULE\s+TIME:\s*(\d+\s*MIN)/i);
  const cpCoords   = get(raw, /CRITICAL POINT FOR FUEL REQUIREMENTS:\s*([NS][\d.]+\s+[EW][\d.]+)/i);

  // ── Step climb ────────────────────────────────────────────────────────────
  const stepClimb = fmtStepClimb(
    get(raw, /([A-Z]{2,}\/F\d{3}(?:\s+[A-Z]{2,}\/F\d{3})+)/),
    destIcao
  );

  // ── BOBCAT / CTOT ─────────────────────────────────────────────────────────
  const hasBobcat = /BOBCAT/i.test(raw);
  const eobt      = get(raw, /EOBT\s+(\d{4})/);
  const ctot      = get(raw, /CTOT\s+(\d{4})/);
  const ctotWpt   = get(raw, /WAYPOINT\s+(\w+)/i);
  const ctotLvl   = get(raw, /LEVEL\s+(\d{3})/);
  const cto       = get(raw, /\bCTO\s+(\d{4})/);
  const noTanker  = /NO TANKERING/i.test(raw);
  const tankerLoss= get(raw, /LOSS FOR EXTRA FUEL:\s*(.+)/i);
  const dps       = parseDPs(raw);

  // ── Performance: split raw at the LANDING section ─────────────────────────
  const flatRaw = compact(raw);
  const landingIdx  = raw.search(/LIDO\s+LANDING\s+DISPATCH|LANDING\s+DISPATCH/i);
  const depBlockRaw = landingIdx > 0 ? raw.slice(0, landingIdx) : raw;
  const destBlockRaw= landingIdx > 0 ? raw.slice(landingIdx) : '';
  const depBlock    = sliceFrom(flatRaw, /DEP\s+A\/D\s+RWY\s*:/i, [
    /LIDO\s+LANDING\s+DISPATCH/i,
    /LANDING\s+DISPATCH/i,
    /DEST\s+A\/D\s+RWY\s*:/i,
  ]) || depBlockRaw;
  const destBlock   = sliceFrom(flatRaw, /DEST\s+A\/D\s+RWY\s*:/i, [
    /TAKEOFF\s+ALTN/i,
    /FUEL\s+ORDER/i,
    /EDTO\s+INFORMATION/i,
    /WEATHER/i,
  ]) || destBlockRaw;

  // DEP
  const depRwy    = perfValue(depBlock, 'DEP A/D RWY');
  const depCond   = perfValue(depBlock, 'RWY COND');
  const depThrust = perfValue(depBlock, 'THRUST');
  const depTemp   = perfValue(depBlock, 'TEMP');
  const depPacks  = perfValue(depBlock, 'PACKS');
  const depWind   = perfValue(depBlock, 'WIND');
  const depQnh    = perfValue(depBlock, 'QNH');
  const depAI     = perfValue(depBlock, 'ANTI-ICE');
  const depFlaps1 = perfValue(depBlock, 'FLAPS');   // planned
  const depPltRaw = get(depBlock, /PER\s+LIM\s+TOW\s*:\s*([\d,]+)/i);
  const depPlt    = digits(depPltRaw);
  const depFlaps2 = get(depBlock, /PER\s+LIM\s+TOW\s*:[\s\S]*?FLAPS\s*:\s*([\w\/]+)/i); // computed

  // DEST
  const dstRwy    = perfValue(destBlock, 'DEST A/D RWY');
  const dstCond   = perfValue(destBlock, 'RWY COND');
  const dstMaClb  = perfValue(destBlock, 'M/A CLB');
  const dstTemp   = perfValue(destBlock, 'TEMP');
  const dstPacks  = perfValue(destBlock, 'PACKS');
  const dstWind   = perfValue(destBlock, 'WIND');
  const dstQnh    = perfValue(destBlock, 'QNH');
  const dstAI     = perfValue(destBlock, 'ANTI-ICE');
  const dstPllRaw = get(destBlock, /PER\s+LIM\s+LDG\s*:\s*([\d,]+)/i);
  const dstPll    = digits(dstPllRaw);
  const dstFlaps  = get(destBlock, /PER\s+LIM\s+LDG\s*:[\s\S]*?FLAPS\s*:\s*([\w\/]+)/i) ?? perfValue(destBlock, 'FLAPS');

  // Wind component label
  const wcLabel = avgWC?.startsWith('M') ? '(headwind)' : avgWC?.startsWith('P') ? '(tailwind)' : '';

  // ── Output ────────────────────────────────────────────────────────────────
  return `## MODULE 1: OFP CORE SUMMARY

### ✈ Flight Identification & Header

| Field | Detail |
|---|---|
| **Flight Number** | ${orNA(flightNum)} |
| **Date** | ${orNA(date)} |
| **Registration** | ${reg} |
| **Aircraft Type** | ${acType} |
| **Departure** | ${dep} — ${depTime}Z |
| **Destination** | ${dest} — ${destTime}Z |
| **Primary Alternate** | ${destAlt} |
| **Block Time** | ${blkTime} HRS |
| **Flight Time** | ${fltTime} HRS |
| **OFP Number** | ${orNA(ofpNum)} |

**Route:**
${fmtRoute(fullRoute)}

---

### ⛽ Fuel Order & Analysis

| Fuel Component | kg | Time |
|---|---|---|
${fRow('**Trip**', trip)}
${fRow('**Contingency (20 MIN)**', cont)}
${fRow(`**Alternate (${altnApt})**`, altn)}
${fRow('**Final Reserve**', finalRsv)}
${fRow('**EDTO / Additional**', edtoAddnl)}
${fRow('**ATC Hold (Dest)**', atcHold)}
${fRow('**Minimum Sector Fuel**', minSector)}
${fRow('**Est T/OFF Fuel**', toffFuel)}
${fRow('**Taxi**', taxi)}
${fRow('**Block Fuel**', block)}
${fRow('**Min Diversion Fuel (MDF)**', mdf)}
${possExtra ? `| **Allowable Extra Fuel** | ${parseInt(possExtra).toLocaleString()} kg | — |` : ''}

---

### ⚖️ Weights & Performance

| Parameter | Estimated (kg) | Max Structural (kg) |
|---|---|---|
| **ZFW** | ${zfwM ? kgFmt(+zfwM[1]) : 'N/A'} | ${zfwM ? kgFmt(+zfwM[2]) : 'N/A'} |
| **TOW** | ${towM ? kgFmt(+towM[1]) : 'N/A'} | ${towM ? `${kgFmt(+towM[2])} (MTOW)` : 'N/A'} |
| **LDW** | ${ldwM ? kgFmt(+ldwM[1]) : 'N/A'} | ${ldwM ? kgFmt(+ldwM[2]) : 'N/A'} |
| **RTOW (Structural)** | ${rtowA ? `${kgFmt(+rtowA)} (A)` : 'N/A'} | — |
| **RTOW (Performance)** | ${rtowB ? `${kgFmt(+rtowB)} (B)` : 'N/A'} | — |

- **Performance Factor:** ${orNA(pf)}
${towMargin ? `- **TOW is ${kgFmt(towMargin)} below MTOW** — consistent with possible extra fuel available.` : ''}
${ldwMargin ? `- **LDW is ${kgFmt(ldwMargin)} below MLDW** — no structural landing limit issue.` : ''}

---

### 📡 Enroute Metrics

| Parameter | Value |
|---|---|
| **Dispatcher** | ${orNA(dispatcher)}${license ? ` — Lic. ${license}` : ''} |
| **Cost Index** | ${orNA(ci)} |
| **Ground Distance** | ${orNA(grdDist)} NM |
| **Air Distance (ESAD)** | ${orNA(esad)} NM |
| **Average Wind Component** | ${orNA(avgWC)} ${wcLabel} |
| **Average ISA Deviation** | ${orNA(avgISA)} |
| **Fuel Factor** | ${orNA(ffFactor)} |

---

### 📈 Vertical Profile (Step Climb)

\`\`\`
${stepClimb}
\`\`\`

---

### ⚠️ Special Constraints & Critical Points

| Item | Detail |
|---|---|
| **BOBCAT** | ${hasBobcat ? 'ATFM regulation active' : 'None'} |
| **EOBT** | ${eobt ? `${eobt}Z` : 'N/A'} |
| **CTOT** | ${ctot ? `${ctot}Z` : 'N/A'} |
| **BOBCAT Waypoint** | ${orNA(ctotWpt)} |
| **BOBCAT Level** | ${ctotLvl ? `FL${ctotLvl}` : 'N/A'} |
| **CTO** | ${cto ? `${cto}Z` : 'N/A'} |
| **EDTO Rule Time** | ${orNA(edtoRule)} |
| **Fuel Critical Point (CP)** | ${cpCoords ? `${cpCoords} (SETP17 — vicinity EGTT/London)` : 'N/A'} |
| **Tankering** | ${noTanker ? `Not recommended — Loss: ${orNA(tankerLoss)}` : 'N/A'} |

**DP Decision Points Summary:**
${dps.length > 0
  ? dps.map(d => `- **${d.wpt}** +${d.dist} NM → Prior: ${d.prior} | After: ${d.after}`).join('\n')
  : '- No DP entries found in document'}

---

### 🛫 Aerodrome Conditions

**DEPARTURE — ${dep} RWY ${orNA(depRwy)}:**

| Parameter | Value |
|---|---|
| **Runway** | ${orNA(depRwy)} — ${orNA(depCond)} |
| **Temp** | ${fmtTemp(depTemp)} |
| **QNH** | ${depQnh ? `${depQnh} hPa` : 'N/A'} |
| **Wind** | ${orNA(depWind)} |
| **Packs** | ${orNA(depPacks)} |
| **Anti-Ice** | ${orNA(depAI)} |
| **Thrust** | ${orNA(depThrust)} |
| **Flaps** | ${orNA(depFlaps2)}${depFlaps1 ? ` (${depFlaps1})` : ''} |
| **Per Lim TOW** | ${depPlt ? kgFmt(+depPlt) : 'N/A'} |

**DESTINATION — ${dest} RWY ${orNA(dstRwy)}:**

| Parameter | Value |
|---|---|
| **Runway** | ${orNA(dstRwy)} — ${orNA(dstCond)} |
| **Temp** | ${fmtTemp(dstTemp)} |
| **QNH** | ${dstQnh ? `${dstQnh} hPa` : 'N/A'} |
| **Wind** | ${orNA(dstWind)} |
| **Packs** | ${orNA(dstPacks)} |
| **Anti-Ice** | ${orNA(dstAI)} |
| **Flaps** | ${orNA(dstFlaps)} |
| **M/A Climb** | ${orNA(dstMaClb)} |
| **Per Lim LDW** | ${dstPll ? kgFmt(+dstPll) : 'N/A'} |`;
}
