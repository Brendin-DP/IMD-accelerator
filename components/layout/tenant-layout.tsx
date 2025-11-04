"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, User, LogOut, ChevronDown, Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const subdomain = params?.subdomain as string;
  const [user, setUser] = useState<any>(null);
  const [clientName, setClientName] = useState<string>("");
  const [notificationCount, setNotificationCount] = useState<number>(0);

  // Don't show layout on login page
  const isLoginPage = pathname?.includes("/login");

  useEffect(() => {
    // Get participant user from localStorage
    const storedUser = localStorage.getItem("participant");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        
        // Fetch notifications count
        if (userData.id) {
          fetchNotificationCount(userData.id);
          
          // Set up polling to check for new notifications every 30 seconds
          const interval = setInterval(() => {
            fetchNotificationCount(userData.id);
          }, 30000);
          
          return () => clearInterval(interval);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }

    // Fetch client name from subdomain
    if (subdomain) {
      // You can fetch client name here if needed
      setClientName(subdomain.charAt(0).toUpperCase() + subdomain.slice(1));
    }
  }, [subdomain]);

  async function fetchNotificationCount(userId: string) {
    try {
      // Get session start timestamp
      const sessionStart = sessionStorage.getItem(`session_start_${userId}`);
      if (!sessionStart) {
        sessionStorage.setItem(`session_start_${userId}`, new Date().toISOString());
      }
      const lastChecked = sessionStorage.getItem(`notifications_last_checked_${userId}`) || sessionStorage.getItem(`session_start_${userId}`) || new Date(0).toISOString();

      // Count new review requests (where user is reviewer, status = pending, created after last check)
      const { count: reviewRequestsCount } = await supabase
        .from("reviewer_nominations")
        .select("*", { count: "exact", head: true })
        .eq("reviewer_id", userId)
        .eq("status", "pending")
        .gt("created_at", lastChecked);

      // For status changes, we need to check nominations user created that are accepted/rejected
      // and haven't been seen yet
      const { data: statusChanges } = await supabase
        .from("reviewer_nominations")
        .select("id")
        .eq("nominated_by_id", userId)
        .in("status", ["accepted", "rejected"]);

      const seenNotifications = JSON.parse(sessionStorage.getItem(`seen_notifications_${userId}`) || "[]");
      const sessionStartTime = sessionStorage.getItem(`session_start_${userId}`) || new Date(0).toISOString();
      
      // Filter to only show unseen status changes from this session
      const unseenStatusChanges = statusChanges?.filter((change: any) => 
        !seenNotifications.includes(change.id)
      ).length || 0;

      const totalCount = (reviewRequestsCount || 0) + unseenStatusChanges;
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
      <aside className="fixed left-0 top-0 h-screen w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Logo/Header */}
          <div className="flex h-16 items-center border-b px-6">
            <h1 className="text-xl font-semibold">IMD Accelerator</h1>
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
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }
                  `}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Notifications */}
          <div className="px-4 pb-2">
            <Link
              href={`/tenant/${subdomain}/notifications`}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                ${
                  isActive(`/tenant/${subdomain}/notifications`)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }
              `}
            >
              <Bell className="h-5 w-5" />
              <span className="flex-1">Notifications</span>
              {notificationCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                  {notificationCount}
                </span>
              )}
            </Link>
          </div>

          {/* Profile Section */}
          <div className="border-t p-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent transition-colors focus:outline-none border-0 bg-transparent shadow-none appearance-none cursor-pointer">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground flex-shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {user?.name && user?.surname
                      ? `${user.name} ${user.surname}`
                      : user?.name
                        ? user.name
                        : user?.surname
                          ? user.surname
                          : user?.email || "Profile"}
                  </span>
                  <span className="text-xs text-muted-foreground">View Profile</span>
                </div>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground ml-auto" />
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

