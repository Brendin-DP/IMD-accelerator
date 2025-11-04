import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const subdomain = host.split(".")[0];
  const pathname = req.nextUrl.pathname;

  // Skip if already a tenant route (to prevent double rewriting)
  if (pathname.startsWith("/tenant/")) {
    return NextResponse.next();
  }

  // Skip admin and local routes (or routes without subdomain)
  if (
    subdomain === "admin" || 
    host.includes("localhost") || 
    !subdomain ||
    host.split(".").length <= 1 // No subdomain (e.g., just "example.com")
  ) {
    return NextResponse.next();
  }

  // Rewrite requests for subdomain tenants
  // Map common routes to tenant structure
  let tenantPath = pathname;
  
  // Map root or /login to tenant login
  if (pathname === "/" || pathname === "/login") {
    tenantPath = "/login";
  } 
  // Map /dashboard to tenant dashboard
  else if (pathname === "/dashboard") {
    tenantPath = "/dashboard";
  }
  // Map /cohorts to tenant /cohort (singular)
  else if (pathname === "/cohorts" || pathname.startsWith("/cohorts/")) {
    tenantPath = pathname.replace("/cohorts", "/cohort");
  }
  // Keep /cohort paths as-is for tenant routes
  else if (pathname.startsWith("/cohort/")) {
    tenantPath = pathname;
  }

  const url = req.nextUrl.clone();
  url.pathname = `/tenant/${subdomain}${tenantPath}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - tenant/ (already rewritten routes)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|tenant/).*)",
  ],
};