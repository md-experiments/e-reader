import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

const PROMPT_PREFIX =
  'You are a professional literary translator. Translate the following text to Bulgarian. ' +
  'Preserve all paragraph breaks, heading levels, and punctuation. ' +
  'Return only the translated text — no preamble, no notes, no commentary.';

function buildPrompt(text: string, prevPageText?: string): string {
  return (
    PROMPT_PREFIX +
    (prevPageText?.trim()
      ? '\n\nFor context, here is the previous page (do NOT translate it, use it only to ensure continuity):\n\n' +
        prevPageText + '\n\n---\n\nNow translate this page:\n\n' + text
      : '\n\n' + text)
  );
}

async function translateWithGemini(prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const stream = await ai.models.generateContentStream({
    model: 'gemini-3.1-flash-lite',
    config: { thinkingConfig: { thinkingBudget: 0 } },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  let text = '';
  for await (const chunk of stream) {
    if (chunk.text) text += chunk.text;
  }
  return text;
}

async function translateWithClaude(prompt: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

export async function POST(req: NextRequest) {
  const idToken = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { uid?: string; text?: string; prevPageText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { uid, text, prevPageText } = body;
  if (!uid || !text?.trim()) {
    return NextResponse.json({ error: 'Missing uid or text' }, { status: 400 });
  }

  // Verify admin status via Firestore REST API using the user's own ID token.
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const firestoreUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${uid}`;

  const adminRes = await fetch(firestoreUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch(() => null);

  if (!adminRes?.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const prompt = buildPrompt(text, prevPageText);
    const useClaude = process.env.TRANSLATION_LLM === 'claude';
    const translatedText = useClaude
      ? await translateWithClaude(prompt)
      : await translateWithGemini(prompt);
    return NextResponse.json({ translatedText });
  } catch (err) {
    console.error('[translate]', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
