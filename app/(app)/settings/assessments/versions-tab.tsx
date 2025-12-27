"use client";

import { useState, useEffect } from "react";
import { Plus, MoreVertical, Eye, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
// Using API routes to bypass RLS for admin operations

interface TemplateVersion {
  id: string;
  template_id: string;
  version_name: string;
  status: "draft" | "published";
  created_at: string | null;
  template?: {
    id: string;
    name: string;
  };
}

interface AssessmentTemplate {
  id: string;
  name: string;
  assessment_type_id: string;
}

export default function VersionsTab() {
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState<string>("all");
  const [showDrafts, setShowDrafts] = useState(false);
  const [formData, setFormData] = useState({
    template_id: "",
    version_name: "",
    status: "draft" as "draft" | "published",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetchVersions();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (isDialogOpen) {
      setFormData({
        template_id: "",
        version_name: "",
        status: "draft",
      });
    }
  }, [isDialogOpen]);

  async function fetchVersions() {
    try {
      setLoading(true);
      setError(null);

      let url = "/api/admin/assessments/versions?";
      if (selectedTemplateFilter !== "all") {
        url += `template_id=${selectedTemplateFilter}&`;
      }
      if (!showDrafts) {
        url += "status=published";
      }

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch versions");
      }

      setVersions(result.data || []);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTemplates() {
    try {
      const response = await fetch("/api/admin/assessments/templates");
      const result = await response.json();

      if (!response.ok) {
        console.error("Error fetching templates:", result.error);
      } else {
        setTemplates(result.data || []);
      }
    } catch (err) {
      console.error("Error fetching templates:", err);
    }
  }

  useEffect(() => {
    fetchVersions();
  }, [selectedTemplateFilter, showDrafts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    if (!formData.template_id) {
      setSubmitError("Template is required");
      setSubmitting(false);
      return;
    }

    if (!formData.version_name.trim()) {
      setSubmitError("Version name is required");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/assessments/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: formData.template_id,
          version_name: formData.version_name.trim(),
          status: formData.status,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Error creating version:", result.error);
        setSubmitError(result.error || "Failed to create version");
        return;
      }

      setIsDialogOpen(false);
      await fetchVersions();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePublishClick(versionId: string) {
    setPublishingVersionId(versionId);
    setIsPublishDialogOpen(true);
  }

  async function handlePublishConfirm() {
    if (!publishingVersionId) return;

    try {
      setPublishing(true);

      const response = await fetch(`/api/admin/assessments/versions/${publishingVersionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Error publishing version:", result.error);
        setSubmitError(result.error || "Failed to publish version");
        setIsPublishDialogOpen(false);
        setPublishingVersionId(null);
        setPublishing(false);
        return;
      }

      setIsPublishDialogOpen(false);
      setPublishingVersionId(null);
      await fetchVersions();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setPublishing(false);
    }
  }

  const filteredVersions = versions.filter((version) => {
    if (selectedTemplateFilter !== "all" && version.template_id !== selectedTemplateFilter) {
      return false;
    }
    if (!showDrafts && version.status === "draft") {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header with Add Version Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Versions</h2>
          <p className="text-muted-foreground mt-1">Manage template versions</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Version
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <label htmlFor="template-filter" className="text-sm font-medium mr-2">
            Filter by Template:
          </label>
          <select
            id="template-filter"
            value={selectedTemplateFilter}
            onChange={(e) => setSelectedTemplateFilter(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All Templates</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="show-drafts"
            checked={showDrafts}
            onChange={(e) => setShowDrafts(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="show-drafts" className="text-sm font-medium">
            Show Drafts
          </label>
        </div>
      </div>

      {/* Versions Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading versions...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : filteredVersions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No versions found. Click "Create Version" to create your first version.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Template</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Version Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVersions.map((version) => (
                <tr key={version.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">
                    {(version.template as any)?.name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">{version.version_name}</td>
                  <td className="px-6 py-4 text-sm">
                    {version.status === "published" ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-800">
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {version.created_at
                      ? new Date(version.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {version.status === "draft" && (
                          <DropdownMenuItem onClick={() => handlePublishClick(version.id)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Publish
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem disabled>
                          <Eye className="mr-2 h-4 w-4" />
                          View Questions
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Version Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Version</DialogTitle>
            <DialogDescription>
              Create a new version for an assessment template
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => {
            setIsDialogOpen(false);
            setSubmitError(null);
          }} />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="template_id" className="text-sm font-medium">
                Template <span className="text-destructive">*</span>
              </label>
              <select
                id="template_id"
                name="template_id"
                value={formData.template_id}
                onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="version_name" className="text-sm font-medium">
                Version Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="version_name"
                name="version_name"
                value={formData.version_name}
                onChange={(e) => setFormData({ ...formData, version_name: e.target.value })}
                placeholder="e.g., v1.0, 2024 Q1"
                className="mt-1"
                required
              />
            </div>

            {submitError && (
              <div className="text-sm text-destructive">{submitError}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setSubmitError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Publish Confirmation Dialog */}
      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Version</DialogTitle>
            <DialogDescription>
              Are you sure you want to publish this version? Once published, the version and its questions cannot be edited.
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => {
            setIsPublishDialogOpen(false);
            setPublishingVersionId(null);
          }} />

          {submitError && (
            <div className="text-sm text-destructive">{submitError}</div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsPublishDialogOpen(false);
                setPublishingVersionId(null);
                setSubmitError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePublishConfirm}
              disabled={publishing}
            >
              {publishing ? "Publishing..." : "Publish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

