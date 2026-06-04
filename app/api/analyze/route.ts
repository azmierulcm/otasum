import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_API_KEY ?? '';
const GEMINI_MODEL  = 'gemini-2.0-flash';

const genai = new GoogleGenerativeAI(GOOGLE_AI_KEY);

// Each model instance carries its own system instruction
const wxModel = genai.getGenerativeModel({
  model: GEMINI_MODEL,
  systemInstruction: WX_SYSTEM_PROMPT,
  generationConfig: { maxOutputTokens: 4096 },
});

const notamModel = genai.getGenerativeModel({
  model: GEMINI_MODEL,
  systemInstruction: NOTAM_SYSTEM_PROMPT,
  generationConfig: { maxOutputTokens: 3000 },
});

const MODULE_META = [
  { number: 1, key: 'ofp',       label: 'OFP Core Summary',  shortLabel: 'OFP'   },
  { number: 2, key: 'weather',   label: 'Weather Briefing',   shortLabel: 'WX'    },
  { number: 3, key: 'notams',    label: 'NOTAMs',             shortLabel: 'NOTAM' },
  { number: 4, key: 'windshear', label: 'Windshear Analysis', shortLabel: 'WS'    },
  { number: 5, key: 'edto',      label: 'EDTO Breakdown',     shortLabel: 'EDTO'  },
  { number: 6, key: 'fuel',      label: 'Fuel vs MDF',        shortLabel: 'FUEL'  },
];

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

        // ── 3. Validate API key before calling Gemini ───────────────────────
        if (!GOOGLE_AI_KEY) {
          send({ type: 'error', message: 'GOOGLE_AI_API_KEY is not set. Add it to your environment variables.' });
          controller.close();
          return;
        }

        // ── 4. Gemini calls — both start now, each streams when it finishes ──
        const wxSection    = extractWxSection(rawText);
        const notamSection = extractNotamSection(rawText);

        const wxPromise = wxModel
          .generateContent(buildWxMessage(ctx, wxSection))
          .then(result => {
            const wxText = stripModuleHeader(result.response.text());
            send({ type: 'module', data: buildModule(MODULE_META[1], wxText) });
          })
          .catch(err => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[WX Gemini]', msg);
            send({ type: 'module', data: buildModule(MODULE_META[1], `*Weather briefing failed — ${msg}*`) });
          });

        const notamPromise = notamModel
          .generateContent(buildNotamMessage(ctx, notamSection))
          .then(result => {
            const notamText = stripModuleHeader(result.response.text());
            send({ type: 'module', data: buildModule(MODULE_META[2], notamText) });
          })
          .catch(err => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[NOTAM Gemini]', msg);
            send({ type: 'module', data: buildModule(MODULE_META[2], `*NOTAM briefing failed — ${msg}*`) });
          });

        await Promise.all([wxPromise, notamPromise]);
        send({ type: 'done' });
        controller.close();

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed.';
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'));
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
