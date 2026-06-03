import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  WX_SYSTEM_PROMPT,
  NOTAM_SYSTEM_PROMPT,
  buildWxMessage,
  buildNotamMessage,
} from '@/lib/systemPrompt';
import { Module } from '@/lib/types';
import { extractPdfTextFromUrl } from '@/lib/serverPdfExtract';
import {
  runLocalParsers,
  extractFlightContext,
  extractWxSection,
  extractNotamSection,
} from '@/lib/parsers';

export const runtime  = 'nodejs';
export const maxDuration = 120;

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODULE_META = [
  { number: 1, key: 'ofp',       label: 'OFP Core Summary',  shortLabel: 'OFP'   },
  { number: 2, key: 'weather',   label: 'Weather Briefing',   shortLabel: 'WX'    },
  { number: 3, key: 'notams',    label: 'NOTAMs',             shortLabel: 'NOTAM' },
  { number: 4, key: 'windshear', label: 'Windshear Analysis', shortLabel: 'WS'    },
  { number: 5, key: 'edto',      label: 'EDTO Breakdown',     shortLabel: 'EDTO'  },
  { number: 6, key: 'fuel',      label: 'Fuel vs MDF',        shortLabel: 'FUEL'  },
];

function claudeText(msg: Anthropic.Message): string {
  const block = msg.content[0];
  return block.type === 'text' ? block.text : '';
}

/** Strip the ## MODULE N: header line from Claude's response — the UI adds its own badge. */
function stripModuleHeader(text: string): string {
  return text.replace(/^##\s*MODULE\s*\d+:[^\n]*\n*/i, '').trimStart();
}

function buildModule(meta: typeof MODULE_META[number], content: string): Module {
  const header = `## MODULE ${meta.number}: ${meta.label.toUpperCase()}`;
  const body   = stripModuleHeader(content).trim() || '*No data found for this module.*';
  return {
    number: meta.number,
    key:    meta.key,
    label:  meta.label,
    shortLabel: meta.shortLabel,
    content: `${header}\n\n${body}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Desktop fallback can still send text directly. Mobile/iPad can send a Firebase
    // download URL so PDF extraction happens on the server instead of the device.
    const { text, fileUrl, fileName } = await request.json() as {
      text?: string;
      fileUrl?: string;
      fileName?: string;
    };
    const rawText = text?.trim() || (fileUrl ? (await extractPdfTextFromUrl(fileUrl)).trim() : '');

    if (rawText.length < 200) {
      return NextResponse.json({
        error: 'No usable text received. The PDF may be scanned or image-based — run OCR first.',
      }, { status: 422 });
    }

    console.log(`[/api/analyze] ${fileName ?? 'unknown'} — ${rawText.length} chars`);

    // ── 2. Prepare inputs ─────────────────────────────────────────────────────
    const ctx         = extractFlightContext(rawText);
    const wxSection   = extractWxSection(rawText);
    const notamSection= extractNotamSection(rawText);

    // ── 3. Run everything in parallel ─────────────────────────────────────────
    //   • Local parsers  — instant  (modules 1, 4, 5, 6)
    //   • WX Claude call  — ~8–12s  (module 2)
    //   • NOTAM Claude call — ~5–8s (module 3)
    //   Total wall time ≈ max(wx, notam) instead of wx + notam
    const [local, wxMsg, notamMsg] = await Promise.all([
      Promise.resolve(runLocalParsers(rawText)),

      ai.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system:     WX_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: buildWxMessage(ctx, wxSection) }],
      }),

      ai.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 3000,
        system:     NOTAM_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: buildNotamMessage(ctx, notamSection) }],
      }),
    ]);

    // ── 4. Assemble 6 modules in order ─────────────────────────────────────────
    const modules: Module[] = [
      buildModule(MODULE_META[0], local.ofp),
      buildModule(MODULE_META[1], stripModuleHeader(claudeText(wxMsg))),
      buildModule(MODULE_META[2], stripModuleHeader(claudeText(notamMsg))),
      buildModule(MODULE_META[3], local.windshear),
      buildModule(MODULE_META[4], local.edto),
      buildModule(MODULE_META[5], local.fuel),
    ];

    return NextResponse.json({ modules });
  } catch (err) {
    console.error('[/api/analyze]', err);
    const message = err instanceof Error ? err.message : 'Analysis failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
