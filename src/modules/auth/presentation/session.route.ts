import { NextResponse } from 'next/server';
import { validate, ValidationError } from '@/lib/validation';
import { identityProvider, userRepository, roleRepository, sessionTokenService, sessionStore } from './composition';
import { establishSession } from '../application/establish-session.usecase';
import { sessionRequestSchema } from './auth.schemas';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let idToken: string;
  try {
    idToken = validate(sessionRequestSchema, body).idToken;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const result = await establishSession(
    identityProvider,
    userRepository,
    roleRepository,
    sessionTokenService,
    sessionStore,
    { idToken }
  );

  if (!result.ok) {
    const status = result.error.code === 'UNAUTHENTICATED' ? 401 : result.error.code === 'VALIDATION' ? 400 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.json({ user: result.value });
}
