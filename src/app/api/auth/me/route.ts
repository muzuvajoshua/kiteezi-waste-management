import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: me.userId,
      email: me.email,
      name: me.name,
      roles: me.roles,
    },
  });
}
