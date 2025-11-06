"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Settings, User, LogOut, ChevronDown, HelpCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("imd_admin");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        // If user data doesn't have name/surname, fetch fresh from database
        if (userData && (!userData.name || !userData.surname) && userData.id) {
          // Fetch fresh user data from imd_users table
          supabase
            .from("imd_users")
            .select("id, email, name, surname, role, status, created_at")
            .eq("id", userData.id)
            .single()
            .then(({ data, error }: { data: any; error: any }) => {
              if (!error && data) {
                localStorage.setItem("imd_admin", JSON.stringify(data));
                setUser(data);
              } else {
                setUser(userData);
              }
            });
        } else {
          setUser(userData);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("imd_admin");
    router.push("/login");
  };

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Cohorts", href: "/cohorts", icon: Users },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

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
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                    ${
                      isActive
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
              href="/help"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <HelpCircle className="h-5 w-5" />
              <span className="flex-1">Help</span>
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
                <DropdownMenuItem onClick={() => router.push("/profile")}>
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

