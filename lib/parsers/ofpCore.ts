import { parseFuel, kgFmt, orNA, FuelEntry } from './utils';

// ── Small helpers ────────────────────────────────────────────────────────────

function get(text: string, re: RegExp, g = 1): string | null {
  return text.match(re)?.[g] ?? null;
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
  const flightNum = get(raw, /^([A-Z]+\s+\d+)\s+OFP\s+/m);
  const ofpNum    = get(raw, /OFP\s+([\d\/]+)\s+\(/);
  const date      = get(raw, /(\d{2}\s+[A-Z]{3}\s+\d{4})/);
  const reg       = fmtReg(get(raw, /^([A-Z0-9]{5})\s+DEP:/m) ?? '');
  const acType    = expandType(get(raw, /^([A-Z]\d{3}[A-Z]?)\s+\w+\/\w+\s+\d{4}\s+UTC/m));

  const routeHdr = raw.match(/^([A-Z]\d{3}[A-Z]?)\s+(\w+\/\w+)\s+(\d{4})\s+UTC\s+(\w+\/\w+)\s+(\d{4})\s+UTC\s+(\w+\/\w+)/m);
  const dep       = routeHdr?.[2] ?? 'N/A';
  const depTime   = routeHdr?.[3] ?? 'N/A';
  const dest      = routeHdr?.[4] ?? 'N/A';
  const destTime  = routeHdr?.[5] ?? 'N/A';
  const destAlt   = routeHdr?.[6] ?? 'N/A';
  const destIcao  = dest.split('/')[0] ?? 'DEST';

  const timesM  = raw.match(/(\d{2}:\d{2})\s+HRS\s+(\d{2}:\d{2})\s+HRS/);
  const blkTime = timesM?.[1] ?? 'N/A';
  const fltTime = timesM?.[2] ?? 'N/A';

  // Full route (between DEFRTE and TAKEOFF ALTN: / 3% ERA:)
  const routeBodyM = raw.match(/DEFRTE\s*\n([\s\S]+?)(?=\nTAKEOFF ALTN:|\n3%\s+ERA:|\nMEL\s*\/)/i);
  const fullRoute  = routeBodyM
    ? routeBodyM[1].split('\n').map(l => l.trim()).filter(l => l.length > 3).join(' ')
    : 'N/A';

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

  let sectorNote = '';
  if (minSector && toffFuel) {
    const diff = minSector.kg - toffFuel.kg;
    if (diff !== 0) {
      const dir = diff > 0 ? 'exceeds' : 'is below';
      sectorNote = `\n> **Note:** Minimum Sector Fuel (**${minSector.kg.toLocaleString()} kg**) ${dir} Est T/OFF Fuel (**${toffFuel.kg.toLocaleString()} kg**) by **${Math.abs(diff).toLocaleString()} kg**. T/OFF Fuel used for dispatch as planned.`;
    }
  }

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
  const landingIdx  = raw.indexOf('LIDO LANDING DISPATCH');
  const depBlock    = landingIdx > 0 ? raw.slice(0, landingIdx) : raw;
  const destBlock   = landingIdx > 0 ? raw.slice(landingIdx) : '';

  // DEP
  const depRwy    = get(depBlock, /DEP\s+A\/D\s+RWY:\s+(\S+)/);
  const depCond   = get(depBlock, /RWY\s+COND:\s+(\w+)/i);
  const depThrust = get(depBlock, /THRUST:\s*(\w+)/i);
  const depTemp   = get(depBlock, /\nTEMP\s+:\s*([PM]\d+)/);
  const depPacks  = get(depBlock, /PACKS\s+:\s*(\w+)/);
  const depWind   = get(depBlock, /WIND\s+:\s*(\S+)/);
  const depQnh    = get(depBlock, /QNH\s+:\s*(\d{4})/);
  const depAI     = get(depBlock, /ANTI-ICE:\s*(\w+)/);
  const depFlaps1 = get(depBlock, /FLAPS\s+:\s*(OPTIMUM|\w+)/i);   // planned
  const depPlt    = get(depBlock, /PER\s+LIM\s+TOW:\s+(\d+)/);
  const depFlaps2 = get(depBlock, /PER\s+LIM\s+TOW:.*?FLAPS\s+:\s*(\w+)/i); // computed

  // DEST
  const dstRwy    = get(destBlock, /DEST\s+A\/D\s+RWY:\s+(\S+)/);
  const dstCond   = get(destBlock, /RWY\s+COND:\s+(\w+)/i);
  const dstMaClb  = get(destBlock, /M\/A\s+CLB:\s*(\S+)/i);
  const dstTemp   = get(destBlock, /\nTEMP\s+:\s*([PM]\d+)/);
  const dstPacks  = get(destBlock, /PACKS\s+:\s*(\w+)/);
  const dstWind   = get(destBlock, /WIND\s+:\s*(\S+)/);
  const dstQnh    = get(destBlock, /QNH\s+:\s*(\d{4})/);
  const dstAI     = get(destBlock, /ANTI-ICE:\s*(\w+)/);
  const dstPll    = get(destBlock, /PER\s+LIM\s+LDG:\s+(\d+)/i);
  const dstFlaps  = get(destBlock, /PER\s+LIM\s+LDG:[^\n]*?FLAPS\s+:\s*([\w\/]+)/i);

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
| **Routing** | ${fullRoute} |

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
${possExtra ? `| **Possible Extra Available** | ${parseInt(possExtra).toLocaleString()} kg | — |` : ''}
${sectorNote}

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
