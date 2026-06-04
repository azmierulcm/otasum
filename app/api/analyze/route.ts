import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  WX_SYSTEM_PROMPT,
  NOTAM_SYSTEM_PROMPT,
  buildWxMessage,
  buildNotamMessage,
} from '@/lib/systemPrompt';
import { Module } from '@/lib/types';
import {
  runLocalParsers,
  extractFlightContext,
  extractWxSection,
  extractNotamSection,
} from '@/lib/parsers';

export const runtime = 'nodejs';
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

function stripModuleHeader(text: string): string {
  return text.replace(/^##\s*MODULE\s*\d+:[^\n]*\n*/i, '').trimStart();
}

function buildModule(meta: typeof MODULE_META[number], content: string): Module {
  const header = `## MODULE ${meta.number}: ${meta.label.toUpperCase()}`;
  const body   = stripModuleHeader(content).trim() || '*No data found for this module.*';
  return { number: meta.number, key: meta.key, label: meta.label, shortLabel: meta.shortLabel, content: `${header}\n\n${body}` };
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      }

      try {
        // ── 1. Accept extracted text from browser ────────────────────────────
        const { text, fileName } = await request.json() as {
          text?: string;
          fileName?: string;
        };

        const rawText = text?.trim() ?? '';

        if (rawText.length < 200) {
          send({ type: 'error', message: 'No usable text received. The PDF may be scanned or image-based — run OCR first.' });
          controller.close();
          return;
        }

        console.log(`[/api/analyze] ${fileName ?? 'unknown'} — ${rawText.length} chars`);

        // ── 2. Local parsers — stream immediately (< 1 s) ───────────────────
        const ctx   = extractFlightContext(rawText);
        const local = runLocalParsers(rawText);
        send({ type: 'module', data: buildModule(MODULE_META[0], local.ofp) });
        send({ type: 'module', data: buildModule(MODULE_META[3], local.windshear) });
        send({ type: 'module', data: buildModule(MODULE_META[4], local.edto) });
        send({ type: 'module', data: buildModule(MODULE_META[5], local.fuel) });

        // ── 3. Claude calls — both start now, each streams when it finishes ──
        const wxSection    = extractWxSection(rawText);
        const notamSection = extractNotamSection(rawText);

        const wxPromise = ai.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 4096,
          system:     WX_SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: buildWxMessage(ctx, wxSection) }],
        }).then(msg => {
          send({ type: 'module', data: buildModule(MODULE_META[1], stripModuleHeader(claudeText(msg))) });
        }).catch(() => {
          send({ type: 'module', data: buildModule(MODULE_META[1], '*Weather briefing unavailable — analysis failed.*') });
        });

        const notamPromise = ai.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system:     NOTAM_SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: buildNotamMessage(ctx, notamSection) }],
        }).then(msg => {
          send({ type: 'module', data: buildModule(MODULE_META[2], stripModuleHeader(claudeText(msg))) });
        }).catch(() => {
          send({ type: 'module', data: buildModule(MODULE_META[2], '*NOTAM briefing unavailable — analysis failed.*') });
        });

        await Promise.all([wxPromise, notamPromise]);
        send({ type: 'done' });
        controller.close();

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed.';
        const send2 = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        send2({ type: 'error', message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
