// ── Types ────────────────────────────────────────────────────────────────────

interface WptEntry {
  waypoint: string;
  fl: string;       // raw: "360", "CLB", "DES", "T-O-C"
  wv: string;       // "DDD/SSS"
  windDir: number;
  windSpd: number;
  ws: number;
  index: number;    // sequence order in log
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function flDisplay(fl: string): string {
  if (fl === 'CLB' || fl === 'T-O-C') return 'CLIMB';
  if (fl === 'DES') return 'DESCENT';
  return `FL${fl}`;
}

function wsEmoji(ws: number): string {
  if (ws >= 6) return '🔴';
  if (ws >= 3) return '🟡';
  return '🟢';
}

function shearZoneLabel(e: WptEntry, windDelta: number | null): string {
  const isDesc   = e.fl === 'DES' || (!isNaN(parseInt(e.fl)) && parseInt(e.fl) < 200);
  const isClimb  = e.fl === 'CLB' || e.fl === 'T-O-C';
  const highWind = e.windSpd >= 50;
  const highWS   = e.ws >= 5;

  if (highWind && highWS && (isDesc || !isClimb)) return 'Classic jetstream shear zone';
  if (isClimb) return 'Jetstream entry zone';
  if (isDesc)  return 'Descent phase shear layer';
  if (!isNaN(parseInt(e.fl)) && parseInt(e.fl) <= 100) return 'Low-level windshear zone';
  if (!isNaN(parseInt(e.fl)) && parseInt(e.fl) >= 350 && highWind) return 'Classic jetstream shear zone';
  return 'Upper-level wind transition';
}

/** Compose the operational briefing paragraph per spec trigger table. */
function buildBriefing(peak: WptEntry, windDelta: number | null): string {
  const lines: string[] = [];
  if (peak.ws >= 6) lines.push('Most severe windshear on the profile. Expect significant speed variations and altimetry discrepancies during descent through this layer.');
  if (peak.ws >= 5) lines.push('Brief the cabin early.');
  if (peak.ws >= 4) lines.push('Monitor indicated airspeed closely during transit of this layer.');
  if (windDelta !== null && Math.abs(windDelta) >= 50) {
    lines.push(`Wind velocity ${windDelta > 0 ? 'increase' : 'decrease'} of ${Math.abs(windDelta)} KT across the shear layer — altimetry cross-check recommended.`);
  } else if (windDelta !== null && Math.abs(windDelta) >= 30) {
    lines.push('Notable wind velocity shift across the shear layer.');
  }
  if (!isNaN(parseInt(peak.fl)) && parseInt(peak.fl) <= 100) lines.push('Consider windshear go-around briefing for approach phase.');
  if (peak.ws >= 5) lines.push('Consider delaying seatbelt sign removal post-cruise until clear of the shear layer.');
  return lines.join(' ') || 'No specific action triggers met for this shear value.';
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseWindshear(raw: string): string {
  // Parse every waypoint log line-1 entry (WS=0 included — needed for neighbours).
  // Line-1 format: WPT  FL  W/V  TAS  MTK  WS  | TIME  ELTM | USED
  const allEntries: WptEntry[] = [];
  const wptRe = /^\s*([A-Z][A-Z0-9\/\-]{2,})\s+((?:T-O-C|CLB|DES|\d{3}))\s+(\d{3}\/\d{3})\s+\d{3}\s+\d{3}\s+(\d+)\s*\|/gm;
  const flatWptRe = /\b([A-Z][A-Z0-9\/\-]{2,})\s+((?:T-O-C|CLB|DES|\d{3}))\s+(\d{3}\/\d{3})\s+\d{3}\s+\d{3}\s+(\d+)\s*\|/g;

  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = wptRe.exec(raw)) !== null) {
    const wv  = m[3];
    const [d, s] = wv.split('/');
    allEntries.push({
      waypoint: m[1].trim(),
      fl:       m[2],
      wv,
      windDir:  parseInt(d),
      windSpd:  parseInt(s),
      ws:       parseInt(m[4]),
      index:    idx++,
    });
  }
  if (allEntries.length === 0) {
    while ((m = flatWptRe.exec(raw)) !== null) {
      const wv  = m[3];
      const [d, s] = wv.split('/');
      allEntries.push({
        waypoint: m[1].trim(),
        fl:       m[2],
        wv,
        windDir:  parseInt(d),
        windSpd:  parseInt(s),
        ws:       parseInt(m[4]),
        index:    idx++,
      });
    }
  }

  // Filter flagged (WS > 0)
  const flagged = allEntries.filter(e => e.ws > 0);

  if (flagged.length === 0) {
    return `## MODULE 4: WINDSHEAR ANALYSIS\n\nNo significant windshear identified on this route profile.`;
  }

  // ── Peak WS (tie → higher sequence_index = closer to destination) ──────────
  const peak = flagged.reduce((best, e) => {
    if (e.ws > best.ws) return e;
    if (e.ws === best.ws && e.index > best.index) return e;
    return best;
  }, flagged[0]);

  // ── Neighbours in full ordered list ───────────────────────────────────────
  const peakPos  = allEntries.findIndex(e => e.index === peak.index);
  const preceding = peakPos > 0                   ? allEntries[peakPos - 1] : null;
  const following = peakPos < allEntries.length - 1 ? allEntries[peakPos + 1] : null;

  // ── Deltas ─────────────────────────────────────────────────────────────────
  const windDelta = (preceding && following)
    ? following.windSpd - preceding.windSpd
    : null;

  const flNumPre = preceding && !isNaN(parseInt(preceding.fl)) ? parseInt(preceding.fl) : null;
  const flNumFol = following && !isNaN(parseInt(following.fl)) ? parseInt(following.fl) : null;
  const flDeltaFt = (flNumPre !== null && flNumFol !== null)
    ? Math.abs(flNumPre - flNumFol) * 100
    : null;

  // ── Labels & note ─────────────────────────────────────────────────────────
  const shearLabel = shearZoneLabel(peak, windDelta);
  const briefing   = buildBriefing(peak, windDelta);

  // ── Sort flagged for WS Flags table ───────────────────────────────────────
  const sortedFlagged = [...flagged].sort((a, b) => {
    if (b.ws !== a.ws) return b.ws - a.ws;
    return a.index - b.index;
  });

  // ── Delta block ──────────────────────────────────────────────────────────
  let deltaBlock = '';
  if (windDelta !== null && preceding && following) {
    deltaBlock = `> **${windDelta >= 0 ? '+' : ''}${windDelta} KT across ~${flDeltaFt !== null ? flDeltaFt.toLocaleString() : '?'} ft**
> (${preceding.waypoint} ${flDisplay(preceding.fl)} → ${following.waypoint} ${flDisplay(following.fl)}). ${shearLabel}.`;
  } else {
    deltaBlock = `> Wind transition at ${flDisplay(peak.fl)}. ${shearLabel}.`;
  }

  // ── Shear Layer Context table ─────────────────────────────────────────────
  const precRow = preceding
    ? `| ${preceding.waypoint} | ${flDisplay(preceding.fl)} | ${preceding.wv} | — | Preceding |`
    : `| — | — | — | — | Preceding |`;
  const peakRow = `| **${peak.waypoint} ★** | ${flDisplay(peak.fl)} | ${peak.wv} | **${peak.ws}** | **Peak Shear** |`;
  const folRow  = following
    ? `| ${following.waypoint} | ${flDisplay(following.fl)} | ${following.wv} | — | Following |`
    : `| — | — | — | — | Following |`;

  return `## MODULE 4: WINDSHEAR ANALYSIS

### ⚡ Peak Shear — ${peak.waypoint} @ ${flDisplay(peak.fl)}

| Parameter | Detail |
|---|---|
| **Max WS Factor** | **${peak.ws}** |
| **Waypoint** | ${peak.waypoint} |
| **Flight Level** | ${flDisplay(peak.fl)} |
| **Position** | — |
| **Peak Wind Vector** | ${peak.windDir}° / ${peak.windSpd} KT |

---

### Shear Layer Context

| Waypoint | FL | Wind (W/V) | WS | Role |
|---|---|---|---|---|
${precRow}
${peakRow}
${folRow}

${deltaBlock}

---

### Operational Briefing Note

${briefing}

---

### WS Flags — Full Profile

| WS | Waypoint | FL | Wind (W/V) |
|---|---|---|---|
${sortedFlagged.map(e =>
  `| ${wsEmoji(e.ws)} **${e.ws}** | ${e.index === peak.index ? `**${e.waypoint} ★**` : e.waypoint} | ${flDisplay(e.fl)} | ${e.wv} |`
).join('\n')}

*WS index = velocity differential across the waypoint. Higher = greater shear gradient.*`;
}
