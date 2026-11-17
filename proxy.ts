import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (session) {
    return isLoginPage
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (isLoginPage) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/|api/auth(?:/|$)|favicon\\.ico$|(?:next|vercel|window|globe|file)\\.svg$).*)",
  ],
};
