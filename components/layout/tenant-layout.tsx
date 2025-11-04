"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, User, LogOut, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const subdomain = params?.subdomain as string;
  const [user, setUser] = useState<any>(null);
  const [clientName, setClientName] = useState<string>("");

  // Don't show layout on login page
  const isLoginPage = pathname?.includes("/login");

  useEffect(() => {
    // Get participant user from localStorage
    const storedUser = localStorage.getItem("participant");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
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
            <h1 className="text-xl font-semibold">{clientName || "Portal"}</h1>
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

