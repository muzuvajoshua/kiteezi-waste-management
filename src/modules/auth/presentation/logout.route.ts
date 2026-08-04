import { NextResponse } from 'next/server';
import { sessionStore } from './composition';
import { logout } from '../application/logout.usecase';

export async function POST() {
  await logout(sessionStore);
  return NextResponse.json({ ok: true });
}
