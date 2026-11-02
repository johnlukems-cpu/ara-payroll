import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: real authorisation happens in the data access layer (lib/server/auth).
export default function proxy(req: NextRequest) {
  if (!req.cookies.get("ara_session")) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/me/:path*", "/onboarding", "/api/((?!health).*)"] };
