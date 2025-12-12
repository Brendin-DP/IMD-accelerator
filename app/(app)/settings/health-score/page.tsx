"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HealthScoreMechanismPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Health Score Mechanism</h1>
          <p className="text-muted-foreground mt-2">
            Define your events and thresholds for each health category
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/settings/health-score/v2")}
          >
            V2
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/settings/health-score/v3")}
          >
            V3
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Health Score Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Configure your health score mechanism settings here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

