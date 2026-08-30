import { NextResponse } from 'next/server';
import { sessionStore, sessionTokenService, sessionRepository } from './composition';
import { logout } from '../application/logout.usecase';

export async function POST() {
  await logout(sessionStore, sessionTokenService, sessionRepository);
  return NextResponse.json({ ok: true });
}
