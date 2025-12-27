"use client";

import { useState, useEffect } from "react";
import { Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
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

interface AssessmentTemplate {
  id: string;
  name: string;
  assessment_type_id: string;
  description: string | null;
  created_at: string | null;
  assessment_type?: {
    id: string;
    name: string;
  };
}

interface AssessmentType {
  id: string;
  name: string;
  description: string | null;
}

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    assessment_type_id: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchAssessmentTypes();
  }, []);

  useEffect(() => {
    if (isDialogOpen && editingTemplateId) {
      const template = templates.find((t) => t.id === editingTemplateId);
      if (template) {
        setFormData({
          name: template.name,
          assessment_type_id: template.assessment_type_id,
          description: template.description || "",
        });
      }
    } else if (isDialogOpen && !editingTemplateId) {
      setFormData({
        name: "",
        assessment_type_id: "",
        description: "",
      });
    }
  }, [isDialogOpen, editingTemplateId, templates]);

  async function fetchTemplates() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/assessments/templates");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch templates");
      }

      setTemplates(result.data || []);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssessmentTypes() {
    try {
      const response = await fetch("/api/admin/assessments/assessment-types");
      const result = await response.json();

      if (!response.ok) {
        console.error("Error fetching assessment types:", result.error);
      } else {
        setAssessmentTypes(result.data || []);
      }
    } catch (err) {
      console.error("Error fetching assessment types:", err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    if (!formData.name.trim()) {
      setSubmitError("Template name is required");
      setSubmitting(false);
      return;
    }

    if (!formData.assessment_type_id) {
      setSubmitError("Assessment type is required");
      setSubmitting(false);
      return;
    }

    try {
      if (editingTemplateId) {
        // Check if template has versions (using API)
        const versionsResponse = await fetch(`/api/admin/assessments/versions?template_id=${editingTemplateId}`);
        const versionsResult = await versionsResponse.json();

        if (versionsResult.data && versionsResult.data.length > 0) {
          // Don't allow changing type if versions exist
          const originalTemplate = templates.find((t) => t.id === editingTemplateId);
          if (originalTemplate && originalTemplate.assessment_type_id !== formData.assessment_type_id) {
            setSubmitError("Cannot change assessment type when versions exist");
            setSubmitting(false);
            return;
          }
        }

        const response = await fetch(`/api/admin/assessments/templates/${editingTemplateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            assessment_type_id: formData.assessment_type_id,
            description: formData.description.trim() || null,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error("Error updating template:", result.error);
          setSubmitError(result.error || "Failed to update template");
          return;
        }
      } else {
        const response = await fetch("/api/admin/assessments/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            assessment_type_id: formData.assessment_type_id,
            description: formData.description.trim() || null,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error("Error creating template:", result.error);
          setSubmitError(result.error || "Failed to create template");
          return;
        }
      }

      setIsDialogOpen(false);
      setEditingTemplateId(null);
      await fetchTemplates();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(template: AssessmentTemplate) {
    setEditingTemplateId(template.id);
    setIsDialogOpen(true);
  }

  function handleDeleteClick(templateId: string) {
    setDeletingTemplateId(templateId);
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingTemplateId) return;

    try {
      setDeleting(true);

      // Check if template has published versions (using API)
      const versionsResponse = await fetch(`/api/admin/assessments/versions?template_id=${deletingTemplateId}&status=published`);
      const versionsResult = await versionsResponse.json();

      if (versionsResult.data && versionsResult.data.length > 0) {
        setSubmitError("Cannot delete template with published versions");
        setIsDeleteDialogOpen(false);
        setDeletingTemplateId(null);
        setDeleting(false);
        return;
      }

      const response = await fetch(`/api/admin/assessments/templates/${deletingTemplateId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Error deleting template:", result.error);
        setSubmitError(result.error || "Failed to delete template");
        setIsDeleteDialogOpen(false);
        setDeletingTemplateId(null);
        setDeleting(false);
        return;
      }

      setIsDeleteDialogOpen(false);
      setDeletingTemplateId(null);
      await fetchTemplates();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Template Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Templates</h2>
          <p className="text-muted-foreground mt-1">Manage assessment templates</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Templates Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading templates...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No templates found. Click "Create Template" to create your first template.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Template Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">{template.name}</td>
                  <td className="px-6 py-4 text-sm">
                    {(template.assessment_type as any)?.name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {template.description || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {template.created_at
                      ? new Date(template.created_at).toLocaleDateString()
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
                        <DropdownMenuItem onClick={() => handleEdit(template)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(template.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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

      {/* Create/Edit Template Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplateId ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplateId
                ? "Update template information"
                : "Create a new assessment template"}
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => {
            setIsDialogOpen(false);
            setEditingTemplateId(null);
            setSubmitError(null);
          }} />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Template Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 360 Assessment, Pulse Survey"
                className="mt-1"
                required
              />
            </div>

            <div>
              <label htmlFor="assessment_type_id" className="text-sm font-medium">
                Assessment Type <span className="text-destructive">*</span>
              </label>
              <select
                id="assessment_type_id"
                name="assessment_type_id"
                value={formData.assessment_type_id}
                onChange={(e) => setFormData({ ...formData, assessment_type_id: e.target.value })}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Select assessment type</option>
                {assessmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  setEditingTemplateId(null);
                  setSubmitError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingTemplateId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
              Templates with published versions cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => {
            setIsDeleteDialogOpen(false);
            setDeletingTemplateId(null);
          }} />

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingTemplateId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

