"use client";

import { useParams } from "next/navigation";

export default function TenantDashboardPage() {
  const params = useParams();
  const subdomain = params.subdomain as string;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome to {subdomain}</p>
      </div>
      {/* Dashboard content will go here */}
    </div>
  );
}

