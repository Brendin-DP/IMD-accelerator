import Link from "next/link";
import { Users, Building2, ArrowRight, FileText, Plug2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your application settings and configurations</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* User Management Tile */}
        <Link href="/settings/users" className="block">
          <Card className="h-full transition-all hover:shadow-md cursor-pointer hover:border-primary">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-1">User Management</CardTitle>
                    <CardDescription>Manage users and permissions</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Create, edit, and manage user accounts and their access levels
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Client Management Tile */}
        <Link href="/settings/clients" className="block">
          <Card className="h-full transition-all hover:shadow-md cursor-pointer hover:border-primary">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-1">Client Management</CardTitle>
                    <CardDescription>Manage clients and organizations</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Add, update, and manage client information and relationships
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Plan Management Tile */}
        <Link href="/settings/plans" className="block">
          <Card className="h-full transition-all hover:shadow-md cursor-pointer hover:border-primary">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-1">Plan Management</CardTitle>
                    <CardDescription>Manage plans and subscriptions</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Create and manage subscription plans and pricing tiers
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Integrations Tile */}
        <Link href="/settings/integrations" className="block">
          <Card className="h-full transition-all hover:shadow-md cursor-pointer hover:border-primary">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Plug2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-1">Integrations</CardTitle>
                    <CardDescription>Manage third-party integrations</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Configure SSO, API connections, and other third-party services
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Assessment Management Tile */}
        <Link href="/settings/assessments" className="block">
          <Card className="h-full transition-all hover:shadow-md cursor-pointer hover:border-primary">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <ClipboardList className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-1">Assessment Management</CardTitle>
                    <CardDescription>Create and manage assessment templates</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Build assessment templates, versions, and questions without seeding
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

