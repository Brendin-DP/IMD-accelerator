import TenantLayoutComponent from "@/components/layout/tenant-layout";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <TenantLayoutComponent>{children}</TenantLayoutComponent>;
}

