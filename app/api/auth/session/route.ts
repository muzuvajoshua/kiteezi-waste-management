import { NextResponse } from "next/server";
import { verifyWeb3AuthToken } from "@/lib/web3auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { getUserByEmail, createUser } from "@/utils/db/internal";
import { assignRole } from "@/utils/db/roles";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const idToken = (body as { idToken?: unknown })?.idToken;
  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  let claims;
  try {
    claims = await verifyWeb3AuthToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = claims.email;
  if (!email) {
    return NextResponse.json({ error: "Token has no email claim" }, { status: 401 });
  }

  let dbUser = await getUserByEmail(email);
  if (!dbUser) {
    dbUser = await createUser(email, claims.name || "Anonymous User");
    if (dbUser) {
      // Every new user starts as a citizen (KWM-008).
      await assignRole(dbUser.id, "citizen");
    }
  }
  if (!dbUser) {
    return NextResponse.json({ error: "Could not resolve user" }, { status: 500 });
  }

  // The cookie carries identity only; roles are resolved from the DB per request.
  const token = await createSessionToken({ userId: dbUser.id });
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: dbUser.id, email: dbUser.email, name: dbUser.name },
  });
}
