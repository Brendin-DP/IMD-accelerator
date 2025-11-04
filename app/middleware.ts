import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const subdomain = host.split(".")[0];
  const pathname = req.nextUrl.pathname;

  // Debug (optional during dev)
  console.log("🔹 Host:", host, "| Subdomain:", subdomain, "| Path:", pathname);

  // 1️⃣ Skip if already a tenant route (avoid infinite rewrites)
  if (pathname.startsWith("/tenant/")) {
    return NextResponse.next();
  }

  // 2️⃣ Skip admin + routes without subdomain
  // Only skip localhost if it's EXACTLY "localhost" (not subdomain.localhost)
  const isPlainLocalhost = host === "localhost" || host.startsWith("localhost:");
  const isAdmin = subdomain === "admin";
  const hasNoSubdomain = !subdomain || host.split(".").length <= 1;

  if (isAdmin || isPlainLocalhost || hasNoSubdomain) {
    console.log("⏭️ Skipping middleware:", { isAdmin, isPlainLocalhost, hasNoSubdomain, host });
    return NextResponse.next();
  }

  // 3️⃣ Handle subdomain-based tenant rewrites
  let tenantPath = pathname;

  // Normalize root routes to known tenant paths
  if (pathname === "/" || pathname === "/login") {
    tenantPath = "/login";
  } else if (pathname === "/dashboard") {
    tenantPath = "/dashboard";
  } else if (pathname === "/cohorts" || pathname.startsWith("/cohorts/")) {
    tenantPath = pathname.replace("/cohorts", "/cohort");
  } else if (pathname.startsWith("/cohort/")) {
    tenantPath = pathname;
  }

  // Rewrite to tenant namespace
  const url = req.nextUrl.clone();
  url.pathname = `/tenant/${subdomain}${tenantPath}`;

  // Debug (optional)
  console.log("🔁 Rewriting to:", url.pathname);

  return NextResponse.rewrite(url);
}

// 4️⃣ Limit which routes the middleware applies to
export const config = {
  matcher: [
    // Match all request paths except for static, API, favicon, or already-rewritten tenant routes
    "/((?!api|_next/static|_next/image|favicon.ico|tenant/).*)",
  ],
};