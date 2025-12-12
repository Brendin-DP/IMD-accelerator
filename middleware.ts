import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;
  
  // Extract hostname (without port)
  const hostname = host.split(":")[0];
  
  // 1️⃣ Detect environment (localhost vs production)
  const isLocalhost = 
    hostname.includes("localhost") || 
    hostname.includes("lvh.me") || 
    hostname.includes("127.0.0.1");

  // 2️⃣ Skip if already a tenant route (avoid infinite rewrites)
  if (pathname.startsWith("/tenant/")) {
    console.log("⏭️ Already tenant route, skipping");
    return NextResponse.next();
  }

  // 3️⃣ Get default tenant from env var
  const defaultTenant = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? "admin";

  // 4️⃣ Resolve tenant based on environment
  let tenant: string | null = null;
  
  if (isLocalhost) {
    // Localhost: Extract tenant from subdomain
    // admin.lvh.me → admin
    // admin.localhost → admin
    // localhost → null (no subdomain)
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      tenant = null; // No subdomain
    } else {
      tenant = hostname.split(".")[0];
    }
  } else {
    // Production: Extract tenant from path
    // /tenant/admin/login → admin
    // /tenant/imd/login → imd
    const pathParts = pathname.split("/");
    if (pathParts[1] === "tenant" && pathParts[2]) {
      tenant = pathParts[2];
    }
  }

  // 5️⃣ Fallback to default tenant if no tenant resolved
  tenant = tenant ?? defaultTenant;

  console.log("🔹 Middleware - Host:", host, "| IsLocalhost:", isLocalhost, "| Tenant:", tenant, "| Path:", pathname);

  // 6️⃣ Production-only redirect: /login → /tenant/{defaultTenant}/login
  if (!isLocalhost && pathname === "/login") {
    const redirectUrl = new URL(`/tenant/${defaultTenant}/login`, req.url);
    console.log("🔄 Redirecting /login to:", redirectUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 7️⃣ Skip admin routes and plain localhost (no subdomain) in localhost mode
  if (isLocalhost) {
    const isPlainLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isAdmin = tenant === "admin";
    
    if (isAdmin || isPlainLocalhost) {
      console.log("⏭️ Skipping middleware - Admin or plain localhost:", { isAdmin, isPlainLocalhost, host, tenant });
      return NextResponse.next();
    }
  }

  // 8️⃣ Localhost: Rewrite subdomain routes to tenant paths
  if (isLocalhost && tenant && tenant !== "admin" && !pathname.startsWith("/tenant/")) {
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
    } else if (pathname === "/notifications" || pathname.startsWith("/notifications/")) {
      tenantPath = pathname; // Keep as-is for notifications page
    }

    // Rewrite to tenant namespace
    const url = req.nextUrl.clone();
    url.pathname = `/tenant/${tenant}${tenantPath}`;
    
    console.log("🔁 Rewriting to:", url.pathname);
    return NextResponse.rewrite(url);
  }

  // 9️⃣ Production: Pass through (tenant routes are already in path format)
  return NextResponse.next();
}

// 4️⃣ Limit which routes the middleware applies to
export const config = {
  matcher: [
    // Match all request paths except for static, API, favicon, or already-rewritten tenant routes
    "/((?!api|_next/static|_next/image|favicon.ico|tenant/).*)",
  ],
};