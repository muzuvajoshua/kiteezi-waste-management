import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { getUserById } from "@/utils/db/actions";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: session.role,
    },
  });
}
