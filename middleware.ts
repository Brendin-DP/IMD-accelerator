import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;
  
  // Extract subdomain - handle both localhost and production domains
  let subdomain = "";
  if (host.includes("localhost")) {
    // For localhost:3000 or subdomain.localhost:3000
    const parts = host.split(":");
    const hostname = parts[0];
    if (hostname === "localhost") {
      subdomain = ""; // No subdomain
    } else {
      // subdomain.localhost
      subdomain = hostname.split(".")[0];
    }
  } else {
    // Production: subdomain.example.com
    subdomain = host.split(".")[0];
  }

  console.log("🔹 Middleware - Host:", host, "| Subdomain:", subdomain, "| Path:", pathname);

  // 1️⃣ Skip if already a tenant route (avoid infinite rewrites)
  if (pathname.startsWith("/tenant/")) {
    console.log("⏭️ Already tenant route, skipping");
    return NextResponse.next();
  }

  // 2️⃣ Skip admin + plain localhost (no subdomain)
  const isPlainLocalhost = host === "localhost" || host.startsWith("localhost:");
  const isAdmin = subdomain === "admin";
  const hasNoSubdomain = !subdomain || (host.includes("localhost") && host.split(".")[0] === "localhost");

  if (isAdmin || hasNoSubdomain) {
    console.log("⏭️ Skipping middleware - Admin or no subdomain:", { isAdmin, hasNoSubdomain, host, subdomain });
    return NextResponse.next();
  }

  // 3️⃣ Handle subdomain-based tenant rewrites
  let tenantPath = pathname;

  // Normalize root routes to known tenant paths
  if (pathname === "/" || pathname === "/login") {
    tenantPath = "/login";
  } else if (pathname === "/dashboard") {
    tenantPath = "/dashboard";
  } else if (pathname === "/cohort" || pathname.startsWith("/cohort/")) {
    tenantPath = pathname; // Keep as-is
  } else if (pathname === "/cohorts" || pathname.startsWith("/cohorts/")) {
    tenantPath = pathname.replace("/cohorts", "/cohort");
  } else if (pathname.startsWith("/assessments/")) {
    tenantPath = pathname; // Keep as-is for assessment detail pages
  }

  // Rewrite to tenant namespace
  const url = req.nextUrl.clone();
  url.pathname = `/tenant/${subdomain}${tenantPath}`;

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