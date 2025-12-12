"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface HealthScoreEvent {
  id: number;
  name: string;
}

interface HealthScoreRow {
  id: string;
  event: string;
  type: "Count" | "Interval";
  poor: string;
  concerning: string;
  healthy: string;
  weight: string;
}

interface CategoryData {
  name: string;
  weight: string;
  rows: HealthScoreRow[];
}

export default function HealthScoreV2Page() {
  const router = useRouter();
  const [events, setEvents] = useState<HealthScoreEvent[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([
    {
      name: "Engagement",
      weight: "30",
      rows: [],
    },
    {
      name: "Basic Feature Coverage",
      weight: "40",
      rows: [],
    },
    {
      name: "Rolling Feature Usage",
      weight: "30",
      rows: [],
    },
  ]);

  useEffect(() => {
    // Load events from db.json
    // Try fetching from public folder first, then fallback to hardcoded events
    fetch("/db.json")
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error("Failed to fetch");
      })
      .then((data) => {
        if (data.health_score_events) {
          setEvents(data.health_score_events);
        }
      })
      .catch((err) => {
        console.error("Error loading events from db.json, using fallback:", err);
        // Fallback to hardcoded events
        const fallbackEvents: HealthScoreEvent[] = [
          { id: 1, name: "User Login" },
          { id: 2, name: "Feature A Accessed" },
          { id: 3, name: "Feature B Accessed" },
          { id: 4, name: "Feature C Accessed" },
          { id: 5, name: "Dashboard Viewed" },
          { id: 6, name: "Report Generated" },
          { id: 7, name: "Data Exported" },
          { id: 8, name: "Settings Updated" },
          { id: 9, name: "Notification Read" },
          { id: 10, name: "Search Performed" },
          { id: 11, name: "Filter Applied" },
          { id: 12, name: "Export Completed" },
          { id: 13, name: "Import Started" },
          { id: 14, name: "API Call Made" },
          { id: 15, name: "File Uploaded" },
          { id: 16, name: "File Downloaded" },
          { id: 17, name: "Collaboration Started" },
          { id: 18, name: "Comment Added" },
          { id: 19, name: "Share Performed" },
          { id: 20, name: "Integration Connected" },
          { id: 21, name: "Workflow Created" },
          { id: 22, name: "Template Used" },
          { id: 23, name: "Automation Triggered" },
          { id: 24, name: "Alert Configured" },
          { id: 25, name: "Backup Created" },
          { id: 26, name: "Restore Performed" },
          { id: 27, name: "Permission Changed" },
          { id: 28, name: "Role Assigned" },
          { id: 29, name: "Audit Log Viewed" },
          { id: 30, name: "Support Ticket Created" },
        ];
        setEvents(fallbackEvents);
      });
  }, []);

  const addRow = (categoryIndex: number) => {
    setCategories((prev) => {
      const newCategories = [...prev];
      newCategories[categoryIndex] = {
        ...newCategories[categoryIndex],
        rows: [
          ...newCategories[categoryIndex].rows,
          {
            id: `row-${Date.now()}-${Math.random()}`,
            event: "",
            type: "Count",
            poor: "",
            concerning: "",
            healthy: "",
            weight: "",
          },
        ],
      };
      return newCategories;
    });
  };

  const removeRow = (categoryIndex: number, rowId: string) => {
    setCategories((prev) => {
      const newCategories = [...prev];
      newCategories[categoryIndex] = {
        ...newCategories[categoryIndex],
        rows: newCategories[categoryIndex].rows.filter((row) => row.id !== rowId),
      };
      return newCategories;
    });
  };

  const updateRow = (
    categoryIndex: number,
    rowId: string,
    field: keyof HealthScoreRow,
    value: string
  ) => {
    setCategories((prev) => {
      const newCategories = [...prev];
      const category = newCategories[categoryIndex];
      category.rows = category.rows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      );
      return newCategories;
    });
  };

  const updateCategoryWeight = (categoryIndex: number, weight: string) => {
    setCategories((prev) => {
      const newCategories = [...prev];
      newCategories[categoryIndex] = {
        ...newCategories[categoryIndex],
        weight,
      };
      return newCategories;
    });
  };

  const handleSave = () => {
    // TODO: Implement save logic
    console.log("Saving configuration:", categories);
    alert("Configuration saved! (This is a placeholder)");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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
          <h1 className="text-3xl font-bold">Health Score Mechanism</h1>
          <p className="text-muted-foreground mt-2">
            Define your events and thresholds for each health category
          </p>
        </div>

        {/* Collapsible Sections */}
        <div className="space-y-6">
          <Accordion type="multiple" defaultValue={["engagement", "basic-feature", "rolling-feature"]}>
            {categories.map((category, categoryIndex) => (
              <AccordionItem
                key={categoryIndex}
                value={
                  categoryIndex === 0
                    ? "engagement"
                    : categoryIndex === 1
                    ? "basic-feature"
                    : "rolling-feature"
                }
                className="border border-gray-100 rounded-lg mb-4 bg-white shadow-sm"
              >
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <Settings className="h-5 w-5 text-muted-foreground" />
                      <span className="text-lg font-semibold">{category.name}</span>
                      <span className="px-3 py-1 text-sm font-medium rounded-full bg-primary/10 text-primary">
                        Weight: {category.weight}%
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="space-y-4">
                    {/* Weight Input */}
                    <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
                      <label className="text-sm font-medium text-muted-foreground">
                        Category Weight:
                      </label>
                      <Input
                        type="number"
                        value={category.weight}
                        onChange={(e) => updateCategoryWeight(categoryIndex, e.target.value)}
                        className="w-24"
                        placeholder="30"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>

                    {/* Table */}
                    {category.rows.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">No events added yet.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addRow(categoryIndex)}
                          className="mt-4"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Event
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-100 overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-muted/30 border-b border-gray-100">
                              <th className="px-4 py-3 text-left text-sm font-medium">Event</th>
                              <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                              <th className="px-4 py-3 text-left text-sm font-medium">
                                <span className="bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-medium">
                                  Poor
                                </span>
                              </th>
                              <th className="px-4 py-3 text-left text-sm font-medium">
                                <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded text-xs font-medium">
                                  Concerning
                                </span>
                              </th>
                              <th className="px-4 py-3 text-left text-sm font-medium">
                                <span className="bg-green-50 text-green-600 px-2 py-1 rounded text-xs font-medium">
                                  Healthy
                                </span>
                              </th>
                              <th className="px-4 py-3 text-left text-sm font-medium">Weight</th>
                              <th className="px-4 py-3 text-left text-sm font-medium w-12"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {category.rows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-gray-100 hover:bg-muted/20 transition-colors"
                              >
                                <td className="px-4 py-3">
                                  <Select
                                    value={row.event}
                                    onValueChange={(value) =>
                                      updateRow(categoryIndex, row.id, "event", value)
                                    }
                                  >
                                    <SelectTrigger className="w-full h-9 border-gray-200">
                                      <SelectValue placeholder="Select event" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {events.map((event) => (
                                        <SelectItem key={event.id} value={event.name}>
                                          {event.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3">
                                  <Select
                                    value={row.type}
                                    onValueChange={(value) =>
                                      updateRow(
                                        categoryIndex,
                                        row.id,
                                        "type",
                                        value as "Count" | "Interval"
                                      )
                                    }
                                  >
                                    <SelectTrigger className="w-full h-9 border-gray-200">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Count">Count</SelectItem>
                                      <SelectItem value="Interval">Interval</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="text"
                                    value={row.poor}
                                    onChange={(e) =>
                                      updateRow(categoryIndex, row.id, "poor", e.target.value)
                                    }
                                    className="w-full h-9 border-gray-200 bg-red-50 text-red-600 placeholder:text-red-400"
                                    placeholder="Threshold"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="text"
                                    value={row.concerning}
                                    onChange={(e) =>
                                      updateRow(
                                        categoryIndex,
                                        row.id,
                                        "concerning",
                                        e.target.value
                                      )
                                    }
                                    className="w-full h-9 border-gray-200 bg-amber-50 text-amber-600 placeholder:text-amber-400"
                                    placeholder="Threshold"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="text"
                                    value={row.healthy}
                                    onChange={(e) =>
                                      updateRow(categoryIndex, row.id, "healthy", e.target.value)
                                    }
                                    className="w-full h-9 border-gray-200 bg-green-50 text-green-600 placeholder:text-green-400"
                                    placeholder="Threshold"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="text"
                                    value={row.weight}
                                    onChange={(e) =>
                                      updateRow(categoryIndex, row.id, "weight", e.target.value)
                                    }
                                    className="w-full h-9 border-gray-200"
                                    placeholder="%"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeRow(categoryIndex, row.id)}
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Add Event Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addRow(categoryIndex)}
                      className="mt-4"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Event
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>

      {/* Save Button - Fixed at bottom right */}
      <div className="fixed bottom-6 right-6">
        <Button onClick={handleSave} size="lg" className="shadow-lg">
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

