import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const GOV_MANAGER_SESSION_COOKIE = "gov_manager_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPath = pathname === "/login";
  const hasSession = Boolean(request.cookies.get(GOV_MANAGER_SESSION_COOKIE)?.value);

  if (!hasSession && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
