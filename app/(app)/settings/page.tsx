"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Building2, ArrowRight, FileText, Plug2, ClipboardList, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OnboardingModal } from "./_onboarding/onboarding-modal";

const ONBOARDING_STORAGE_KEY = "settings_onboarding_completed";

export default function SettingsPage() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);

  useEffect(() => {
    // Check if user has completed onboarding
    const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    setHasCompletedOnboarding(completed);

    // Show onboarding on first visit
    if (!completed) {
      setShowOnboarding(true);
    }
  }, []);

  const handleCompleteOnboarding = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setHasCompletedOnboarding(true);
    setShowOnboarding(false);
  };

  const handleLearnMore = () => {
    setShowOnboarding(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Settings</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLearnMore}
              className="text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4 mr-1" />
              Learn more
            </Button>
          </div>
          <p className="text-muted-foreground mt-2">Manage your application settings and configurations</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* User Management Tile */}
        <Link href="/settings/users" className="block group">
          <Card className="h-full transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-primary/10 cursor-pointer hover:border-primary hover:-translate-y-1">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
                    <Users className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 transition-colors duration-300 group-hover:text-primary">User Management</CardTitle>
                    <CardDescription>Manage users and permissions</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2 transition-all duration-300 group-hover:text-primary group-hover:translate-x-1" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                Create, edit, and manage user accounts and their access levels
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Client Management Tile */}
        <Link href="/settings/clients" className="block group">
          <Card className="h-full transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-primary/10 cursor-pointer hover:border-primary hover:-translate-y-1">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
                    <Building2 className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 transition-colors duration-300 group-hover:text-primary">Client Management</CardTitle>
                    <CardDescription>Manage clients and organizations</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2 transition-all duration-300 group-hover:text-primary group-hover:translate-x-1" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                Add, update, and manage client information and relationships
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Plan Management Tile */}
        <Link href="/settings/plans" className="block group">
          <Card className="h-full transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-primary/10 cursor-pointer hover:border-primary hover:-translate-y-1">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
                    <FileText className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 transition-colors duration-300 group-hover:text-primary">Plan Management</CardTitle>
                    <CardDescription>Manage plans and subscriptions</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2 transition-all duration-300 group-hover:text-primary group-hover:translate-x-1" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                Create and manage subscription plans and pricing tiers
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Integrations Tile */}
        <Link href="/settings/integrations" className="block group">
          <Card className="h-full transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-primary/10 cursor-pointer hover:border-primary hover:-translate-y-1">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
                    <Plug2 className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 transition-colors duration-300 group-hover:text-primary">Integrations</CardTitle>
                    <CardDescription>Manage third-party integrations</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2 transition-all duration-300 group-hover:text-primary group-hover:translate-x-1" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                Configure SSO, API connections, and other third-party services
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Assessment Management Tile */}
        <Link href="/settings/assessments" className="block group">
          <Card className="h-full transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-primary/10 cursor-pointer hover:border-primary hover:-translate-y-1">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
                    <ClipboardList className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 transition-colors duration-300 group-hover:text-primary">Assessment Management</CardTitle>
                    <CardDescription>View system assessments and questions</CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2 transition-all duration-300 group-hover:text-primary group-hover:translate-x-1" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                View and explore system assessment definitions, questions, and steps
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <OnboardingModal
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onComplete={handleCompleteOnboarding}
      />
    </div>
  );
}

