"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Cloud } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "salesforce",
      name: "Salesforce",
      description: "Connect and sync data with Salesforce",
      icon: <Cloud className="h-8 w-8 text-primary" />,
      connected: false,
    },
  ]);

  const handleConnect = (id: string) => {
    // TODO: Implement connection logic
    console.log("Connecting to:", id);
    setIntegrations((prev) =>
      prev.map((integration) =>
        integration.id === id
          ? { ...integration, connected: !integration.connected }
          : integration
      )
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect third-party services and configure integrations
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card
            key={integration.id}
            className="transition-all hover:shadow-md hover:border-primary"
          >
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                  {integration.icon}
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">{integration.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {integration.description}
                  </p>
                </div>
                <Button
                  onClick={() => handleConnect(integration.id)}
                  variant={integration.connected ? "outline" : "default"}
                  className="w-full"
                >
                  {integration.connected ? "Connected" : "Connect"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

