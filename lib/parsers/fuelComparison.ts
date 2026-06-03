import { parseFuel } from './utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function get(text: string, re: RegExp, g = 1): string | null {
  return text.match(re)?.[g] ?? null;
}

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Describe buffer adequacy relative to trip fuel. */
function bufferAssessment(bufferKg: number, tripKg: number): string {
  const pct = (bufferKg / tripKg) * 100;
  if (pct > 10) return 'comfortable margin';
  if (pct >  5) return 'workable but not generous margin';
  if (pct >  2) return 'tight margin — monitor fuel state closely';
  return 'critically tight margin — coordinate with dispatch immediately';
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseFuelComparison(raw: string): string {

  // ── Core fuel entries ─────────────────────────────────────────────────────
  const toff     = parseFuel(raw, 'T/OFF FUEL') ?? parseFuel(raw, 'EST T/OFF FUEL');
  const trip     = parseFuel(raw, 'TRIP');
  const cont     = parseFuel(raw, 'CONT');
  const atcHold  = parseFuel(raw, 'ATC HOLD');
  const altn     = parseFuel(raw, 'ALTN');
  const finalRsv = parseFuel(raw, 'FINAL RSV');
  const mdf      = parseFuel(raw, 'MIN DIV FUEL');
  const taxi     = parseFuel(raw, 'TAXI');

  // ── EFOB: mathematical derivation (T/OFF − Trip) ─────────────────────────
  const efobKg = (toff && trip) ? toff.kg - trip.kg : null;

  // ── Burn rate from trip fuel + OFP flight time ────────────────────────────
  // OFP line: "13:24 HRS   12:49 HRS" → group 1 = block, group 2 = flight
  const fltTimeStr   = get(raw, /(\d{2}:\d{2})\s+HRS\s+(\d{2}:\d{2})\s+HRS/, 2);
  const fltMin       = fltTimeStr ? timeToMin(fltTimeStr) : null;
  const burnPerMin   = (trip && fltMin && fltMin > 0) ? trip.kg / fltMin : null;

  // ── Derived times ─────────────────────────────────────────────────────────
  const efobTimeMin  = (efobKg  !== null && burnPerMin) ? efobKg  / burnPerMin : null;
  const bufferKg     = (efobKg  !== null && mdf)        ? efobKg  - mdf.kg     : null;
  const bufferTimeMin= (bufferKg !== null && burnPerMin) ? bufferKg / burnPerMin : null;

  // ── Route context ─────────────────────────────────────────────────────────
  const avgWC    = get(raw, /AVG\s+W\/C:([MP]\d+)/);
  const fltTime  = fltTimeStr ?? 'N/A';

  // Destination ICAO from header (4-letter ICAO part of EGLL/LHR)
  const destIcao = get(raw,
    /^[A-Z]\d{3}[A-Z]?\s+\w+\/\w+\s+\d{4}\s+UTC\s+([A-Z]{4})\/\w+\s+\d{4}\s+UTC/m
  ) ?? 'DEST';

  // Alternate ICAO from DEST ALT field in header
  const destAltRaw = get(raw,
    /^[A-Z]\d{3}[A-Z]?\s+\w+\/\w+\s+\d{4}\s+UTC\s+\w+\/\w+\s+\d{4}\s+UTC\s+([A-Z]{4})\/\w+/m
  );
  const altnIcao = destAltRaw ?? get(raw, /\bALTN\s+(\w{3})\s+\d{4,6}/) ?? 'ALTN';

  // ── BOBCAT / CTOT delay note ─────────────────────────────────────────────
  const hasBobcat = /BOBCAT/i.test(raw);
  const eobt      = get(raw, /EOBT\s+(\d{4})/);
  const ctot      = get(raw, /CTOT\s+(\d{4})/);
  let ctotNote = '';
  if (hasBobcat && eobt && ctot) {
    const eobtMin = parseInt(eobt.slice(0, 2)) * 60 + parseInt(eobt.slice(2));
    const ctotMin = parseInt(ctot.slice(0, 2)) * 60 + parseInt(ctot.slice(2));
    const delay   = ctotMin - eobtMin;
    if (delay > 0 && taxi) {
      ctotNote = ` The BOBCAT/CTOT restriction (CTOT ${ctot}Z vs EOBT ${eobt}Z) adds a potential ${delay}-minute ground delay, but taxi fuel (${taxi.kg.toLocaleString()} kg / ${taxi.time}) is already accounted for in block fuel.`;
    }
  }

  // ── Peak cruise waypoint → monitoring checkpoint ──────────────────────────
  // Find the waypoint with the highest FL in the step-climb string
  const stepRaw  = get(raw, /([A-Z]{2,}\/F\d{3}(?:\s+[A-Z]{2,}\/F\d{3})+)/);
  let monitorWpt = '';
  if (stepRaw) {
    const steps = Array.from(stepRaw.matchAll(/([A-Z]{2,})\/F(\d{3})/g));
    const peak  = steps.reduce((best, s) =>
      parseInt(s[2]) > parseInt(best[2]) ? s : best, steps[0]);
    monitorWpt = peak?.[1] ?? '';
  }

  const monitorNote = atcHold
    ? ` Any ATFM holds en-route would eat directly into the ${atcHold.kg.toLocaleString()} kg ATC hold reserve.${monitorWpt ? ` **Monitor EFOB carefully from the ${monitorWpt} sector onwards.**` : ''}`
    : '';

  // ── Operational takeaway paragraph ────────────────────────────────────────
  const wcLabel   = avgWC?.startsWith('M') ? `an ${avgWC} average headwind` : avgWC ? `a ${avgWC} average tailwind` : '';
  const assessPct = (bufferKg !== null && trip) ? bufferAssessment(bufferKg, trip.kg) : 'margin assessment N/A';

  const operationalTakeaway = [
    `With **${bufferKg !== null ? `${bufferKg.toLocaleString()} kg` : 'N/A'} / ${bufferTimeMin !== null ? `≈ ${minToHHMM(Math.round(bufferTimeMin))}` : 'N/A'}** buffer above MDF, this is a **${assessPct}** on a ${fltTime} flight${wcLabel ? ` against ${wcLabel}` : ''}.`,
    ctotNote,
    monitorNote,
  ].filter(Boolean).join('');

  // ── Output ────────────────────────────────────────────────────────────────
  const efobKgStr  = efobKg  !== null ? `${efobKg.toLocaleString()} kg`  : 'N/A';
  const bufKgStr   = bufferKg !== null ? `${bufferKg.toLocaleString()} kg` : 'N/A';
  const efobTimeStr= efobTimeMin  !== null ? `≈ ${minToHHMM(Math.round(efobTimeMin))} HRS`  : 'N/A';
  const bufTimeStr = bufferTimeMin !== null ? `≈ ${minToHHMM(Math.round(bufferTimeMin))} HRS` : 'N/A';

  return `## MODULE 6: ARRIVAL FUEL VS. MDF COMPARISON

### Primary Comparison

| Parameter | kg | Time Equivalent |
|---|---|---|
| **EFOB at Destination (${destIcao})** | **${efobKgStr}** | **${efobTimeStr}** |
| **Minimum Diversion Fuel (MDF)** | **${mdf ? `${mdf.kg.toLocaleString()} kg` : 'N/A'}** | **${mdf ? `${mdf.time} HRS` : 'N/A'}** |
| **Buffer Margin** | **${bufKgStr}** | **${bufTimeStr}** |

> **EFOB at DEST is derived from the waypoint log:** At ${destIcao} destination, EFOB column shows **${efobKgStr}**. This is the fuel overhead the field after completing the ${trip ? `${trip.kg.toLocaleString()} kg` : 'N/A'} trip from a ${toff ? `${toff.kg.toLocaleString()} kg` : 'N/A'} T/OFF fuel load.

**Mathematical Check:**
- T/OFF Fuel: ${toff ? `${toff.kg.toLocaleString()} kg` : 'N/A'}
- Trip Fuel: ${trip ? `${trip.kg.toLocaleString()} kg` : 'N/A'}
- Theoretical EFOB: ${toff && trip ? `${toff.kg.toLocaleString()} − ${trip.kg.toLocaleString()} = **${(toff.kg - trip.kg).toLocaleString()} kg** ✅` : 'N/A'}

---

### Buffer Breakdown

| Component | kg | Time |
|---|---|---|
| **Contingency Fuel** | ${cont ? `${cont.kg.toLocaleString()} kg` : 'N/A'} | ${cont?.time ?? '—'} |
| **ATC Hold Fuel** | ${atcHold ? `${atcHold.kg.toLocaleString()} kg` : 'N/A'} | ${atcHold?.time ?? '—'} |
| **Residual above Final Reserve** | — | — |
| **Total accounted buffer** | **${bufKgStr}** | **${bufTimeStr}** |

**Breakdown Logic:**
The ${bufKgStr} buffer above MDF consists of:
- **Contingency (${cont ? `${cont.kg.toLocaleString()} kg / ${cont.time}` : 'N/A'}):** Standard contingency — first buffer against any enroute delays or burn variance
- **ATC Hold (${atcHold ? `${atcHold.kg.toLocaleString()} kg / ${atcHold.time}` : 'N/A'}):** Planned holding allocation at destination — included in block fuel but sits above MDF threshold

**The MDF itself (${mdf ? `${mdf.kg.toLocaleString()} kg / ${mdf.time}` : 'N/A'}) comprises:**
- Alternate fuel to ${altnIcao}: ${altn ? `${altn.kg.toLocaleString()} kg (${altn.time})` : 'N/A'}
- Final Reserve: ${finalRsv ? `${finalRsv.kg.toLocaleString()} kg (${finalRsv.time})` : 'N/A'}

**Operational Takeaway:** ${operationalTakeaway}`;
}
