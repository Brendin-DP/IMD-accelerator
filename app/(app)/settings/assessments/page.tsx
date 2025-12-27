"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TemplatesTab from "./templates-tab";
import VersionsTab from "./versions-tab";
import QuestionsTab from "./questions-tab";

export default function AssessmentsPage() {
  const [activeTab, setActiveTab] = useState("templates");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assessment Management</h1>
        <p className="text-muted-foreground mt-2">
          Create and manage assessment templates, versions, and questions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="versions">
          <VersionsTab />
        </TabsContent>

        <TabsContent value="questions">
          <QuestionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

