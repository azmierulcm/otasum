import { tonToKg, kgFmt, hhmmFmt, orNA } from './utils';

// ── Lookup tables ─────────────────────────────────────────────────────────────

const IATA: Record<string, string> = {
  VTBS: 'BKK', VECC: 'CCU', VOHS: 'HYD', VILK: 'LKO',
  VIDP: 'DEL', VAAH: 'AMD', OPKC: 'KHI', OPIS: 'ISB',
  UTDD: 'DYU', UTAA: 'ASB', UBBB: 'GYD', LTAC: 'ESB',
  LTFM: 'IST', LHBP: 'BUD', LOWW: 'VIE', EDDF: 'FRA',
  EBBR: 'BRU', EGLL: 'LHR', WMKK: 'KUL', WMKP: 'PEN',
};

function iata(icao: string): string {
  return IATA[icao] ?? icao;
}

function sapWithIata(sap: string): string {
  return sap.split('/').map(c => c && IATA[c] ? `${c}/${iata(c)}` : c).join(' & ');
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function eobtPlusEltme(eobtHHMM: string, eltmeHHMM: string): string {
  const base = parseInt(eobtHHMM.slice(0, 2)) * 60 + parseInt(eobtHHMM.slice(2));
  const el   = parseInt(eltmeHHMM.slice(0, 2)) * 60 + parseInt(eltmeHHMM.slice(2));
  const tot  = (base + el) % 1440;
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}${String(tot % 60).padStart(2, '0')}Z`;
}

function fmtElapsed(raw: string): string {
  const hh = raw.slice(0, 2); const mm = raw.slice(2);
  return `${hh}:${mm}`;
}

// ── Parsed entry ──────────────────────────────────────────────────────────────

interface EdtoEntry {
  label: string;     // SETP1, EEP, ETP1, EXP …
  sap: string;       // VTBS or WMKK/WMKP
  eltme: string;     // raw 4-digit
  timeAap: string;   // raw 4-digit — time to reach alternate
  dist: string;      // e.g. 91/85 or 435
  mora: string;      // e.g. 040/040 or 057
  cfuelT: number;    // tonnes
  fobT: number;      // tonnes
  cond: string;      // DX or DC
  coords?: string;   // N0359.7 E10050.2
  isa?: string;      // P15/P15
  wc?: string;       // P012/M010
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseEdtoBlock(raw: string): EdtoEntry[] {
  const start = raw.search(/EDTO\s+INFORMATION/i);
  const afterStart = start > -1 ? raw.slice(start) : raw;
  const relativeEnd = afterStart.search(/ENRTE\s+ALTNS|TERRAIN\s+CLEARANCE/i);
  const block = raw.slice(
    start > -1 ? start : 0,
    relativeEnd > 0 && start > -1 ? start + relativeEnd : (start > -1 ? start + 8000 : 8000)
  );

  const entries: EdtoEntry[] = [];
  const lines = block
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const rowRe = /^(SETP\d+|EEP|EXP|ETP\d*)\s+(\S+)\s+(\d{4})\s+(\d{4})\s+([\d\/]+)\s+([\d\/]+)\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s+(\w+)/;

  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[i];
    const m = l1.match(rowRe);
    if (!m) continue;

    const label  = m[1];
    const sap    = m[2];
    const eltme  = m[3];
    const tAap   = m[4];
    const dist   = m[5];
    const mora   = m[6];
    const cfuelT = parseFloat(m[7]);
    const fobT   = parseFloat(m[8]);
    const cond   = m[9];

    // Line 2: coords + ISA + W/C
    const l2 = lines[i + 1] ?? '';
    const coordM = l2.match(/([NS]\d+\.\d+)\s+([EW]\d+\.\d+)/);
    const coords = coordM ? `${coordM[1]} ${coordM[2]}` : undefined;

    // ISA and W/C are the last two tokens on line 2 (after coords and optional notes)
    const tokens = l2.replace(/[NS]\d+\.\d+\s+[EW]\d+\.\d+/, '').replace(/\(\w+\)/, '').trim().split(/\s+/).filter(Boolean);
    const isa = tokens[0];
    const wc  = tokens[1];

    entries.push({ label, sap, eltme, timeAap: tAap, dist, mora, cfuelT, fobT, cond, coords, isa, wc });
  }

  if (entries.length === 0) {
    const flat = block.replace(/\s+/g, ' ');
    const pairRe = /\b(SETP\d+|EEP|EXP|ETP\d*)\s+(\S+)\s+(\d{4})\s+(\d{4})\s+([\d\/]+)\s+([\d\/]+)\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s+(DX|DC)\s+([NS]\d+\.\d+)\s+([EW]\d+\.\d+)(?:\s+\([A-Z]{4}\))?\s+([PM]\d+(?:\/[PM]\d+)?)\s+([PM]\d{3}(?:\/[PM]\d{3})?)/g;
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(flat)) !== null) {
      entries.push({
        label: m[1],
        sap: m[2],
        eltme: m[3],
        timeAap: m[4],
        dist: m[5],
        mora: m[6],
        cfuelT: parseFloat(m[7]),
        fobT: parseFloat(m[8]),
        cond: m[9],
        coords: `${m[10]} ${m[11]}`,
        isa: m[12],
        wc: m[13],
      });
    }
  }

  return entries;
}

function parseEnrteAltns(raw: string): { icao: string; from: string; to: string; wxMin: string; fcstWx: string }[] {
  const block = raw.match(/ENRTE\s+ALTNS\s*\([^)]+\)([\s\S]+?)(?=\n-{20,})/i)?.[1] ?? '';
  const re    = /^([A-Z]{4})\s+([\d:]+)\s+([\d:]+)\s+WX\s+MIN:\s+([\d-]+)\s+FCST\s+WX:\s*([\d-]+)/gm;
  const out: { icao: string; from: string; to: string; wxMin: string; fcstWx: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push({ icao: m[1], from: m[2], to: m[3], wxMin: m[4], fcstWx: m[5] });
  }
  if (out.length === 0) {
    const flat = block.replace(/\s+/g, ' ');
    const flatRe = /\b([A-Z]{4})\s+([\d:]+)\s+([\d:]+)\s+WX\s+MIN:\s*([\d-]+)\s+FCST\s+WX:\s*([\d-]+)/g;
    while ((m = flatRe.exec(flat)) !== null) {
      out.push({ icao: m[1], from: m[2], to: m[3], wxMin: m[4], fcstWx: m[5] });
    }
  }
  return out;
}

// Assess alternate usability: compare forecast vis to minimum vis
function altUsable(wxMin: string, fcstWx: string): string {
  const minVis  = parseInt((wxMin.split('-')[1]  ?? wxMin).replace(/\D/g, '')) || 0;
  const fcstVis = parseInt((fcstWx.split('-')[1] ?? fcstWx).replace(/\D/g, '')) || 0;
  if (fcstVis === 0 || minVis === 0) return '⚠️';
  if (fcstVis >= minVis * 2) return '✅';
  if (fcstVis >= minVis)     return '✅ *(borderline)*';
  return '⚠️';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseEdto(raw: string): string {
  const entries = parseEdtoBlock(raw);
  if (entries.length === 0) {
    return `## MODULE 5: EDTO / ETOPS DISPATCH BREAKDOWN\n\n*No EDTO data found in document.*`;
  }

  const ruleTime = raw.match(/EDTO\s+RULE\s+TIME:\s*(\d+\s*MIN)/i)?.[1]?.trim() ?? 'N/A';
  const cpCoords = raw.match(/CRITICAL POINT FOR FUEL REQUIREMENTS:\s*([NS][\d.]+\s+[EW][\d.]+)/i)?.[1]?.trim() ?? null;
  const eobt     = raw.match(/EOBT\s+(\d{4})/)?.[1] ?? null;

  const eep  = entries.find(e => e.label === 'EEP');
  const exp  = entries.find(e => e.label === 'EXP');
  const etp1 = entries.find(e => e.label === 'ETP1');

  // Identify CP row (coordinates match the declared CP)
  const cp = entries.find(e =>
    cpCoords && e.coords &&
    cpCoords.replace(/\s/g, '').slice(0, 8) === e.coords.replace(/\s/g, '').slice(0, 8)
  ) ?? entries[entries.length - 1];

  const cpFobKg   = tonToKg(cp.fobT);
  const cpCfuelKg = tonToKg(cp.cfuelT);
  const cpMargin  = cpFobKg - cpCfuelKg;

  // Find highest MORA row
  const highestMoraEntry = entries.reduce((best, e) => {
    const v = parseInt(e.mora.split('/')[0]);
    const b = parseInt(best.mora.split('/')[0]);
    return v > b ? e : best;
  }, entries[0]);

  // Find longest diversion time (TIME_AAP) row
  const longestDivEntry = entries.reduce((best, e) => {
    return parseInt(e.timeAap) > parseInt(best.timeAap) ? e : best;
  }, entries[0]);

  // ── Condition / Strategy text ─────────────────────────────────────────────
  const condText = (e: EdtoEntry): string => {
    const base = e.cond === 'DC'
      ? '**DC** — Depressurization / LRC'
      : '**DX** — Single engine, 330 IAS';
    const notes: string[] = [];
    if (e.label === cp.label) notes.push(`Critical Point. EFOB: **${kgFmt(cpFobKg)}**`);
    if (e.label === highestMoraEntry.label && e.label !== cp.label)
      notes.push('Highest MORA in sequence — terrain awareness critical');
    if (e.label === longestDivEntry.label && e.label !== cp.label && e.label !== highestMoraEntry.label)
      notes.push(`Long sector — ${fmtElapsed(e.timeAap)} HRS to ${sapWithIata(e.sap)}`);
    if (e.cond === 'DC' && entries.indexOf(e) > 0 && entries[entries.indexOf(e) - 1]?.cond === 'DX')
      notes.push('Transition to DC strategy post-Europe entry');
    return notes.length ? `${base} — ${notes.join('; ')}` : base;
  };

  // ── Sector Point label ────────────────────────────────────────────────────
  const sectorLabel = (e: EdtoEntry): string => {
    const isCp    = e.label === cp.label;
    const isEep   = e.label === 'EEP';
    const isExp   = e.label === 'EXP';
    const isPreEep = !isEep && entries.indexOf(e) < entries.findIndex(x => x.label === 'EEP');

    const sapDisplay = e.sap.includes('/')
      ? e.sap.split('/').map(c => IATA[c] ? `${c}/${iata(c)}` : c).join(' / ')
      : IATA[e.sap] ? `${e.sap}/${iata(e.sap)}` : e.sap;

    if (isEep) return `**EEP — ${sapDisplay}**`;
    if (isExp) return `**EXP — ${sapDisplay}**`;
    if (isCp)  return `**${e.label} / CP**`;
    if (isPreEep) return `**${e.label}** *(pre-EEP)*`;
    return `**${e.label}**`;
  };

  // ── ETP Pair column ────────────────────────────────────────────────────────
  const etpPairCell = (e: EdtoEntry): string => {
    if (e.label === 'EEP') return 'Entry point';
    if (e.label === 'EXP') return 'Exit point';
    if (e.sap.includes('/')) {
      const [a, b] = e.sap.split('/');
      return `${a} / ${b}`;
    }
    return e.sap;
  };

  // ── MORA display ──────────────────────────────────────────────────────────
  const moraCell = (e: EdtoEntry): string => e.mora.replace('/', ' / ');

  // ── Wind & ISA display ─────────────────────────────────────────────────────
  const windIsaCell = (e: EdtoEntry): string => {
    if (!e.wc && !e.isa) return 'N/A';
    const wc  = e.wc  ?? '—';
    const isa = (e.isa ?? '—').replace('/', '–');
    return `${wc} / ${isa}`;
  };

  // ── EEP/EXP absolute times ─────────────────────────────────────────────────
  const eepAbsTime = eobt && eep ? eobtPlusEltme(eobt, eep.eltme) : null;
  const expAbsTime = eobt && exp ? eobtPlusEltme(eobt, exp.eltme) : null;

  // ── ENRTE ALTNS ───────────────────────────────────────────────────────────
  const altns = parseEnrteAltns(raw);

  // ── Build output ──────────────────────────────────────────────────────────
  return `## MODULE 5: EDTO / ETOPS DISPATCH BREAKDOWN

### Rule & Entry/Exit

| Parameter | Detail |
|---|---|
| **EDTO Rule Time** | **${ruleTime}** |
| **EDTO Entry Point (EEP)** | ${eep ? `**${eep.sap}/${iata(eep.sap)}** — ${eep.coords ?? 'N/A'} — ELTME **${fmtElapsed(eep.eltme)}**${eepAbsTime ? ` (≈ ${eepAbsTime})` : ''}` : 'N/A'} |
| **EDTO Exit Point (EXP)** | ${exp ? `**${exp.sap}/${iata(exp.sap)}** — ${exp.coords ?? 'N/A'} — ELTME **${fmtElapsed(exp.eltme)}**${expAbsTime ? ` (≈ ${expAbsTime})` : ''}` : 'N/A'} |
| **Fuel Critical Point (CP)** | **${cpCoords ?? 'N/A'}** (${cp.label} — near EGTT/London entry) |
| **EFOB at CP** | **${kgFmt(cpFobKg)}** |

---

### EDTO Sector Diversion Checklist

| Sector Point | ETP Pair | Highest MORA | Winds & ISA Dev | Condition / Strategy |
|---|---|---|---|---|
${entries.map(e =>
  `| ${sectorLabel(e)} | ${etpPairCell(e)} | ${moraCell(e)} | ${windIsaCell(e)} | ${condText(e)} |`
).join('\n')}

---

### EDTO Fuel Critical Point Detail

| Parameter | Value |
|---|---|
| **CP Location** | ${cpCoords ?? 'N/A'} (${cp.label}) |
| **COND at CP** | **${cp.cond}** (${cp.cond === 'DC' ? 'Depressurization, LRC speed' : 'Single engine, 330 IAS'}) |
| **FOB at CP** | **${kgFmt(cpFobKg)}** (${cp.fobT} T) |
| **CFUEL required at CP** | ${kgFmt(cpCfuelKg)} (${cp.cfuelT} T) — ${fmtElapsed(cp.timeAap)} HRS diversion |
| **EDTO Margin at CP** | **${kgFmt(cpMargin)}** available above CFUEL requirement |

> The CP sits at the doorstep of destination — the ${ruleTime} rule is satisfied with substantial margin. Operationally demanding sectors: **${highestMoraEntry.label}** (MORA ${highestMoraEntry.mora} — highest terrain clearance requirement)${longestDivEntry.label !== highestMoraEntry.label ? ` and **${longestDivEntry.label}** (${fmtElapsed(longestDivEntry.timeAap)} HRS diversion to ${sapWithIata(longestDivEntry.sap)})` : ''}.

${altns.length > 0 ? `---

**Enroute Alternate Suitability Windows:**
${altns.map(a => {
  const [minA, minB] = a.wxMin.split('-');
  const [fstA, fstB] = a.fcstWx.split('-');
  const usable = altUsable(a.wxMin, a.fcstWx);
  const fmtVal = (v: string) => v ? parseInt(v).toLocaleString() + 'm' : '—';
  return `- **${a.icao}/${iata(a.icao)}:** Suitable ${a.from.replace(':', '')}–${a.to.replace(':', '')}Z — WX MIN ${fmtVal(minA)}/${fmtVal(minB)}. FCST WX: ${fmtVal(fstA)}/${fmtVal(fstB)} ${usable}`;
}).join('\n')}` : ''}`;
}
