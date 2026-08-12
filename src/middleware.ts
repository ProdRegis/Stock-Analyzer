import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "@/lib/site-auth";

const REALM = "Portfolio Risk Analyzer";

export function middleware(request: NextRequest) {
  const decision = decideAccess({
    authorizationHeader: request.headers.get("authorization"),
    expectedPassword: process.env.SITE_PASSWORD,
    expectedUsername: process.env.SITE_USERNAME,
    isProduction: process.env.NODE_ENV === "production",
  });

  if (decision.type === "allow") return NextResponse.next();

  if (decision.type === "misconfigured") {
    return new NextResponse(
      "This deployment is locked because SITE_PASSWORD is not set. Add it to the project's environment variables and redeploy.",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  // Everything except build assets. API routes are included deliberately: the
  // browser replays cached credentials on same-origin requests, so the app
  // still works, but the endpoints are not reachable on their own.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
