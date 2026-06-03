import { parseFuel } from './utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function get(text: string, re: RegExp, g = 1): string | null {
  return text.match(re)?.[g] ?? null;
}

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
  const trip      = parseFuel(raw, 'TRIP');
  const cont      = parseFuel(raw, 'CONT');
  const atcHold   = parseFuel(raw, 'ATC HOLD');
  const altn      = parseFuel(raw, 'ALTN');
  const finalRsv  = parseFuel(raw, 'FINAL RSV');
  const edtoAddnl = parseFuel(raw, 'EDTO / ADDNL');
  const mdf       = parseFuel(raw, 'MIN DIV FUEL');
  const taxi      = parseFuel(raw, 'TAXI');
  const block     = parseFuel(raw, 'BLOCK FUEL');

  // ── EFOB derived from components (robust — avoids T/OFF parsing ambiguity)
  // EFOB = MDF + Contingency + ATC Hold + EDTO/Addnl
  // This equals Block − Taxi − Trip mathematically; MDF = Altn + Final Reserve
  const efobKg = mdf && cont
    ? mdf.kg + cont.kg + (atcHold?.kg ?? 0) + (edtoAddnl?.kg ?? 0)
    : null;

  const bufferKg = efobKg !== null && mdf
    ? efobKg - mdf.kg   // = Cont + ATC Hold + EDTO
    : null;

  // Cross-check via Block − Taxi − Trip (shown but not used as primary)
  const crossCheckKg = block && taxi && trip
    ? block.kg - taxi.kg - trip.kg
    : null;

  // ── Burn rate from trip fuel + OFP flight time ────────────────────────────
  const fltTimeStr = get(raw, /(\d{2}:\d{2})\s+HRS\s+(\d{2}:\d{2})\s+HRS/, 2);
  const fltMin     = fltTimeStr ? timeToMin(fltTimeStr) : null;
  const burnPerMin = (trip && fltMin && fltMin > 0) ? trip.kg / fltMin : null;

  const efobTimeMin  = (efobKg   !== null && burnPerMin) ? efobKg   / burnPerMin : null;
  const bufferTimeMin= (bufferKg !== null && burnPerMin) ? bufferKg / burnPerMin : null;

  // ── Route context ─────────────────────────────────────────────────────────
  const avgWC   = get(raw, /AVG\s+W\/C:([MP]\d+)/);
  const fltTime = fltTimeStr ?? 'N/A';

  const destIcao = get(raw,
    /^[A-Z]\d{3}[A-Z]?\s+\w+\/\w+\s+\d{4}\s+UTC\s+([A-Z]{4})\/\w+\s+\d{4}\s+UTC/m,
  ) ?? 'DEST';

  const destAltRaw = get(raw,
    /^[A-Z]\d{3}[A-Z]?\s+\w+\/\w+\s+\d{4}\s+UTC\s+\w+\/\w+\s+\d{4}\s+UTC\s+([A-Z]{4})\/\w+/m,
  );
  const altnIcao = destAltRaw ?? get(raw, /\bALTN\s+(\w{3})\s+\d{4,6}/) ?? 'ALTN';

  // ── BOBCAT / CTOT delay note ─────────────────────────────────────────────
  const hasBobcat = /BOBCAT/i.test(raw);
  const eobt = get(raw, /EOBT\s+(\d{4})/);
  const ctot = get(raw, /CTOT\s+(\d{4})/);
  let ctotNote = '';
  if (hasBobcat && eobt && ctot && taxi) {
    const eobtMin = parseInt(eobt.slice(0, 2)) * 60 + parseInt(eobt.slice(2));
    const ctotMin = parseInt(ctot.slice(0, 2)) * 60 + parseInt(ctot.slice(2));
    const delay = ctotMin - eobtMin;
    if (delay > 0) {
      ctotNote = ` The BOBCAT/CTOT restriction (CTOT ${ctot}Z vs EOBT ${eobt}Z) adds a potential ${delay}-minute ground delay, but taxi fuel (${taxi.kg.toLocaleString()} kg / ${taxi.time}) is already accounted for in block fuel.`;
    }
  }

  // ── Peak cruise waypoint for monitoring note ──────────────────────────────
  const stepRaw = get(raw, /([A-Z]{2,}\/F\d{3}(?:\s+[A-Z]{2,}\/F\d{3})+)/);
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

  // ── Operational takeaway ──────────────────────────────────────────────────
  const wcLabel    = avgWC?.startsWith('M') ? `an ${avgWC} average headwind` : avgWC ? `a ${avgWC} average tailwind` : '';
  const assessPct  = (bufferKg !== null && trip) ? bufferAssessment(bufferKg, trip.kg) : 'margin assessment N/A';

  const operationalTakeaway = [
    `With **${bufferKg !== null ? `${bufferKg.toLocaleString()} kg` : 'N/A'} / ${bufferTimeMin !== null ? `≈ ${minToHHMM(Math.round(bufferTimeMin))}` : 'N/A'}** buffer above MDF, this is a **${assessPct}** on a ${fltTime} flight${wcLabel ? ` against ${wcLabel}` : ''}.`,
    ctotNote,
    monitorNote,
  ].filter(Boolean).join('');

  // ── Formatted values ──────────────────────────────────────────────────────
  const efobKgStr   = efobKg   !== null ? `${efobKg.toLocaleString()} kg`   : 'N/A';
  const bufKgStr    = bufferKg !== null ? `${bufferKg.toLocaleString()} kg`  : 'N/A';
  const efobTimeStr = efobTimeMin   !== null ? `≈ ${minToHHMM(Math.round(efobTimeMin))} HRS`   : 'N/A';
  const bufTimeStr  = bufferTimeMin !== null ? `≈ ${minToHHMM(Math.round(bufferTimeMin))} HRS`  : 'N/A';

  // ── EFOB formula string for display ──────────────────────────────────────
  const efobParts: string[] = [];
  if (mdf)      efobParts.push(`MDF ${mdf.kg.toLocaleString()} kg`);
  if (cont)     efobParts.push(`Cont ${cont.kg.toLocaleString()} kg`);
  if (atcHold)  efobParts.push(`ATC Hold ${atcHold.kg.toLocaleString()} kg`);
  if (edtoAddnl && edtoAddnl.kg > 0) efobParts.push(`EDTO ${edtoAddnl.kg.toLocaleString()} kg`);

  return `## MODULE 6: ARRIVAL FUEL VS. MDF COMPARISON

### Primary Comparison

| Parameter | kg | Time Equivalent |
|---|---|---|
| **EFOB at Destination (${destIcao})** | **${efobKgStr}** | **${efobTimeStr}** |
| **Minimum Diversion Fuel (MDF)** | **${mdf ? `${mdf.kg.toLocaleString()} kg` : 'N/A'}** | **${mdf ? `${mdf.time} HRS` : 'N/A'}** |
| **Buffer Margin** | **${bufKgStr}** | **${bufTimeStr}** |

**EFOB Calculation:**
${efobParts.join(' + ')} = **${efobKgStr}**

${crossCheckKg !== null ? `**Cross-check (Block − Taxi − Trip):** ${block!.kg.toLocaleString()} − ${taxi!.kg.toLocaleString()} − ${trip!.kg.toLocaleString()} = **${crossCheckKg.toLocaleString()} kg** ${Math.abs(crossCheckKg - (efobKg ?? 0)) <= 10 ? '✅' : '⚠️ Discrepancy — review fuel order'}` : ''}

---

### Buffer Breakdown

| Component | kg | Time |
|---|---|---|
| **Contingency Fuel** | ${cont ? `${cont.kg.toLocaleString()} kg` : 'N/A'} | ${cont?.time ?? '—'} |
| **ATC Hold Fuel** | ${atcHold ? `${atcHold.kg.toLocaleString()} kg` : 'N/A'} | ${atcHold?.time ?? '—'} |
${edtoAddnl && edtoAddnl.kg > 0 ? `| **EDTO / Additional** | ${edtoAddnl.kg.toLocaleString()} kg | ${edtoAddnl.time} |` : ''}
| **Total buffer above MDF** | **${bufKgStr}** | **${bufTimeStr}** |

**The MDF itself (${mdf ? `${mdf.kg.toLocaleString()} kg / ${mdf.time}` : 'N/A'}) comprises:**
- Alternate fuel to ${altnIcao}: ${altn ? `${altn.kg.toLocaleString()} kg (${altn.time})` : 'N/A'}
- Final Reserve: ${finalRsv ? `${finalRsv.kg.toLocaleString()} kg (${finalRsv.time})` : 'N/A'}

**Operational Takeaway:** ${operationalTakeaway}`;
}
