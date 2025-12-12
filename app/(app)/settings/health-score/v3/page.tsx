"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HealthScoreV3Page() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="tertiary"
          onClick={() => router.push("/settings/health-score")}
          className="p-0 h-auto mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Health Score Mechanism
        </Button>
        <h1 className="text-3xl font-bold">Health Score Mechanism V3</h1>
        <p className="text-muted-foreground mt-2">V3 View</p>
      </div>

      {/* Blank Content */}
      <Card>
        <CardHeader>
          <CardTitle>V3 View</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">This is a blank view for V3.</p>
        </CardContent>
      </Card>
    </div>
  );
}

