"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, User, LogOut, ChevronDown, Bell, HelpCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Analytics } from "@vercel/analytics/next"

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const subdomain = params?.subdomain as string;
  const [user, setUser] = useState<any>(null);
  const [clientName, setClientName] = useState<string>("");
  const [notificationCount, setNotificationCount] = useState<number>(0);
  const [validating, setValidating] = useState<boolean>(true);

  // Don't show layout on login page
  const isLoginPage = pathname?.includes("/login");

  useEffect(() => {
    // Skip validation on login page
    if (isLoginPage) {
      setValidating(false);
      return;
    }

    const validateSubdomainAndLoadUser = async () => {
      try {
        setValidating(true);
        
        // Get user from localStorage
        const storedUser = localStorage.getItem("participant");
        if (!storedUser) {
          console.log("No user found in localStorage, redirecting to login");
          router.push(`/tenant/${subdomain}/login`);
          return;
        }

        let userData;
        try {
          userData = JSON.parse(storedUser);
        } catch (parseError) {
          console.error("Error parsing user data:", parseError);
          localStorage.removeItem("participant");
          router.push(`/tenant/${subdomain}/login`);
          return;
        }

        // Fetch client for subdomain
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("subdomain", subdomain)
          .single();

        if (clientError || !client) {
          console.error("Invalid subdomain or client not found:", clientError);
          localStorage.removeItem("participant");
          router.push(`/tenant/${subdomain}/login`);
          return;
        }

        // Verify user belongs to this client
        if (userData.client_id !== client.id) {
          console.error("User doesn't belong to this subdomain. User client_id:", userData.client_id, "Subdomain client_id:", client.id);
          // Redirect to login for this subdomain
          localStorage.removeItem("participant");
          router.push(`/tenant/${subdomain}/login`);
          return;
        }

        // Validation passed - set user and fetch notifications
        setUser(userData);
        setClientName(subdomain.charAt(0).toUpperCase() + subdomain.slice(1));
        
        // Fetch notifications count
        if (userData.id) {
          fetchNotificationCount(userData.id);
          
          // Set up polling to check for new notifications every 30 seconds
          const interval = setInterval(() => {
            fetchNotificationCount(userData.id);
          }, 30000);
          
          // Listen for custom events to refresh notification count
          const handleNotificationUpdate = () => {
            fetchNotificationCount(userData.id);
          };
          window.addEventListener('notification-update', handleNotificationUpdate);
          
          return () => {
            clearInterval(interval);
            window.removeEventListener('notification-update', handleNotificationUpdate);
          };
        }
      } catch (err) {
        console.error("Error validating subdomain:", err);
        localStorage.removeItem("participant");
        router.push(`/tenant/${subdomain}/login`);
      } finally {
        setValidating(false);
      }
    };

    if (subdomain) {
      validateSubdomainAndLoadUser();
    } else {
      setValidating(false);
    }
  }, [subdomain, isLoginPage, router]);

  async function fetchNotificationCount(userId: string) {
    try {
      console.log("🔔 fetchNotificationCount called with userId:", userId, "type:", typeof userId);
      
      // Get session start timestamp - only reset on new login
      const sessionStart = sessionStorage.getItem(`session_start_${userId}`);
      if (!sessionStart) {
        // Initialize session start if it doesn't exist (should only happen on first load after login)
        const now = new Date().toISOString();
        sessionStorage.setItem(`session_start_${userId}`, now);
      }
      const sessionStartTime = sessionStorage.getItem(`session_start_${userId}`) || new Date(0).toISOString();
      // Count shows notifications created after lastChecked
      // On login, lastChecked doesn't exist, so we use sessionStart to show notifications created after login
      // When notifications page loads, lastChecked is set to now, so count resets to 0
      const lastChecked = sessionStorage.getItem(`notifications_last_checked_${userId}`);
      const countFromTime = lastChecked || sessionStartTime;
      console.log("🔔 lastChecked:", lastChecked, "sessionStartTime:", sessionStartTime, "countFromTime:", countFromTime);

      // Count new review requests (where user is reviewer, request_status = pending, created after countFromTime)
      // On login: countFromTime = sessionStart (shows notifications created after login)
      // After visiting notifications page: countFromTime = lastChecked = now (count resets to 0)
      // Need to check both internal (reviewer_id) and external (external_reviewer email) reviewers
      console.log("🔔 Counting review requests for userId:", userId, "countFromTime:", countFromTime);
      
      // Get user's email for external reviewer matching
      const { data: currentUser } = await supabase
        .from("client_users")
        .select("email")
        .eq("id", userId)
        .single();
      
      const userEmail = currentUser?.email?.toLowerCase();
      
      // Count internal review requests
      const { data: internalRequests } = await supabase
        .from("reviewer_nominations")
        .select("id, is_external, nominated_by_id, reviewer_id, created_at")
        .eq("reviewer_id", userId)
        .eq("is_external", false)
        .eq("request_status", "pending")
        .gt("created_at", countFromTime);
      
      // Count external review requests
      let externalRequests: any[] = [];
      if (userEmail) {
        const { data: externalReviewers } = await supabase
          .from("external_reviewers")
          .select("id")
          .eq("email", userEmail)
          .limit(1);
        
        if (externalReviewers && externalReviewers.length > 0) {
          const { data: externalRequestsData } = await supabase
            .from("reviewer_nominations")
            .select("id, is_external, nominated_by_id, reviewer_id, created_at")
            .eq("external_reviewer_id", externalReviewers[0].id)
            .eq("is_external", true)
            .eq("request_status", "pending")
            .gt("created_at", countFromTime);
          
          externalRequests = externalRequestsData || [];
        }
      }
      
      // Combine and filter out self-nominated external reviewers
      const allReviewRequests = [...(internalRequests || []), ...externalRequests];
      const validReviewRequests = allReviewRequests.filter((req: any) => {
        return !(req.is_external === true && req.nominated_by_id === userId);
      });
      
      console.log("🔔 Review requests count query result:", { 
        internal: internalRequests?.length || 0,
        external: externalRequests?.length || 0,
        total: validReviewRequests.length,
        requests: allReviewRequests 
      });

      // For status changes, we need to check nominations user created that are accepted/rejected
      // Show status changes created after countFromTime (so count resets when visiting notifications page)
      const { data: statusChanges } = await supabase
        .from("reviewer_nominations")
        .select("id, created_at")
        .eq("nominated_by_id", userId)
        .in("request_status", ["accepted", "rejected"])
        .gt("created_at", countFromTime);

      const statusChangesCount = statusChanges?.length || 0;

      const totalCount = validReviewRequests.length + statusChangesCount;
      setNotificationCount(totalCount);
    } catch (err) {
      console.error("Error fetching notification count:", err);
      setNotificationCount(0);
    }
  }

  // If login page, don't render sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Show loading state while validating
  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Validating access...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("participant");
    router.push(`/tenant/${subdomain}/login`);
  };

  const navigation = [
    { name: "Dashboard", href: `/tenant/${subdomain}/dashboard`, icon: LayoutDashboard },
    { name: "Cohorts", href: `/tenant/${subdomain}/cohort`, icon: Users },
  ];

  // Check if current path matches navigation item
  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + "/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 border-r bg-primary">
        <div className="flex h-full flex-col">
          {/* Logo/Header */}
          <div className="flex h-16 items-center border-b border-primary-foreground/20 px-6">
            <h1 className="text-xl font-semibold text-primary-foreground">IMD Accelerator</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                    ${
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    }
                  `}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Help Section */}
          <div className="px-4 pb-2">
            <Link
              href={`/tenant/${subdomain}/help`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <HelpCircle className="h-5 w-5" />
              <span className="flex-1">Help</span>
            </Link>
          </div>

          {/* Notifications */}
          <div className="px-4 pb-2">
            <Link
              href={`/tenant/${subdomain}/notifications`}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                ${
                  isActive(`/tenant/${subdomain}/notifications`)
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                }
              `}
            >
              <Bell className="h-5 w-5" />
              <span className="flex-1">Notifications</span>
              {notificationCount > 0 && (
                <span className="bg-primary-foreground/20 text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                  {notificationCount}
                </span>
              )}
            </Link>
          </div>

          {/* Profile Section */}
          <div className="border-t border-primary-foreground/20 p-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-primary-foreground/10 transition-colors focus:outline-none border-0 bg-transparent shadow-none appearance-none cursor-pointer">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground flex-shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate text-primary-foreground">
                    {user?.name && user?.surname
                      ? `${user.name} ${user.surname}`
                      : user?.name
                        ? user.name
                        : user?.surname
                          ? user.surname
                          : user?.email || "Profile"}
                  </span>
                  <span className="text-xs text-primary-foreground/70">View Profile</span>
                </div>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-primary-foreground/70 ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="right-0 bottom-full mb-2">
                <DropdownMenuItem onClick={() => router.push(`/tenant/${subdomain}/profile`)}>
                  <User className="mr-2 h-4 w-4" />
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="ml-64">
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}

