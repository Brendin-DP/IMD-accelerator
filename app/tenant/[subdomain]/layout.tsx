"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const subdomain = params.subdomain as string;

  return (
    <div className="min-h-screen bg-background">
      {/* Tenant-specific layout wrapper */}
      <main className="p-8">{children}</main>
    </div>
  );
}

