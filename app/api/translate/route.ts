import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  // Require a Firebase ID token in the Authorization header
  const idToken = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { uid?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { uid, text } = body;
  if (!uid || !text?.trim()) {
    return NextResponse.json({ error: 'Missing uid or text' }, { status: 400 });
  }

  // Verify admin status: attempt to read admins/{uid} using the user's own ID token.
  // Firestore security rule: allow read: if request.auth.uid == userId
  // 200 → document exists → admin confirmed
  // 404 → document doesn't exist → not an admin
  // 401/403 → bad token or wrong uid
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const firestoreUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${uid}`;

  const adminRes = await fetch(firestoreUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch(() => null);

  if (!adminRes?.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Translate via Claude — ANTHROPIC_API_KEY read automatically from env
  const client = new Anthropic();

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content:
            'You are a professional literary translator. Translate the following text to Bulgarian. ' +
            'Preserve all paragraph breaks, heading levels, and punctuation. ' +
            'Return only the translated text — no preamble, no notes, no commentary.\n\n' +
            text,
        },
      ],
    });

    const translatedText =
      msg.content[0].type === 'text' ? msg.content[0].text : '';

    return NextResponse.json({ translatedText });
  } catch (err) {
    console.error('[translate]', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
