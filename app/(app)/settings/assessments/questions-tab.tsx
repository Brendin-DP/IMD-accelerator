"use client";

import { useState, useEffect } from "react";
import { Plus, MoreVertical, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
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

interface AssessmentQuestion {
  id: string;
  template_version_id: string;
  question_text: string;
  question_order: number;
  category: string | null;
  created_at: string | null;
}

interface TemplateVersion {
  id: string;
  template_id: string;
  version_name: string;
  status: "draft" | "published";
  template?: {
    id: string;
    name: string;
  };
}

export default function QuestionsTab() {
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [selectedVersion, setSelectedVersion] = useState<TemplateVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    question_text: "",
    category: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);

  useEffect(() => {
    fetchVersions();
  }, []);

  useEffect(() => {
    if (selectedVersionId) {
      fetchQuestions();
      const version = versions.find((v) => v.id === selectedVersionId);
      setSelectedVersion(version || null);
    } else {
      setQuestions([]);
      setSelectedVersion(null);
    }
  }, [selectedVersionId, versions]);

  useEffect(() => {
    if (isDialogOpen && editingQuestionId) {
      const question = questions.find((q) => q.id === editingQuestionId);
      if (question) {
        setFormData({
          question_text: question.question_text,
          category: question.category || "",
        });
      }
    } else if (isDialogOpen && !editingQuestionId) {
      setFormData({
        question_text: "",
        category: "",
      });
    }
  }, [isDialogOpen, editingQuestionId, questions]);

  async function fetchVersions() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/assessments/versions");
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

  async function fetchQuestions() {
    if (!selectedVersionId) {
      setQuestions([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/assessments/questions?template_version_id=${selectedVersionId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch questions");
      }

      setQuestions(result.data || []);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    if (!selectedVersionId) {
      setSubmitError("Please select a template version first");
      setSubmitting(false);
      return;
    }

    if (!formData.question_text.trim()) {
      setSubmitError("Question text is required");
      setSubmitting(false);
      return;
    }

    // Check if version is published
    if (selectedVersion?.status === "published") {
      setSubmitError("Cannot edit questions in a published version");
      setSubmitting(false);
      return;
    }

    try {
      if (editingQuestionId) {
        const response = await fetch(`/api/admin/assessments/questions/${editingQuestionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_text: formData.question_text.trim(),
            category: formData.category.trim() || null,
            question_order: questions.find((q) => q.id === editingQuestionId)?.question_order,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error("Error updating question:", result.error);
          setSubmitError(result.error || "Failed to update question");
          return;
        }
      } else {
        // Get max order for this version
        const maxOrder = questions.length > 0
          ? Math.max(...questions.map((q) => q.question_order))
          : -1;

        const response = await fetch("/api/admin/assessments/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_version_id: selectedVersionId,
            question_text: formData.question_text.trim(),
            category: formData.category.trim() || null,
            question_order: maxOrder + 1,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error("Error creating question:", result.error);
          setSubmitError(result.error || "Failed to create question");
          return;
        }
      }

      setIsDialogOpen(false);
      setEditingQuestionId(null);
      await fetchQuestions();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(question: AssessmentQuestion) {
    if (selectedVersion?.status === "published") {
      setSubmitError("Cannot edit questions in a published version");
      return;
    }
    setEditingQuestionId(question.id);
    setIsDialogOpen(true);
  }

  function handleDeleteClick(questionId: string) {
    if (selectedVersion?.status === "published") {
      setSubmitError("Cannot delete questions from a published version");
      return;
    }
    setDeletingQuestionId(questionId);
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingQuestionId) return;

    try {
      setDeleting(true);

      const questionToDelete = questions.find((q) => q.id === deletingQuestionId);
      if (!questionToDelete) {
        setDeleting(false);
        return;
      }

      const response = await fetch(`/api/admin/assessments/questions/${deletingQuestionId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Error deleting question:", result.error);
        setSubmitError(result.error || "Failed to delete question");
        setIsDeleteDialogOpen(false);
        setDeletingQuestionId(null);
        setDeleting(false);
        return;
      }

      // Reorder remaining questions
      const remainingQuestions = questions
        .filter((q) => q.id !== deletingQuestionId)
        .sort((a, b) => a.question_order - b.question_order);

      // Update orders via API
      for (let i = 0; i < remainingQuestions.length; i++) {
        if (remainingQuestions[i].question_order !== i) {
          await fetch(`/api/admin/assessments/questions/${remainingQuestions[i].id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question_text: remainingQuestions[i].question_text,
              category: remainingQuestions[i].category,
              question_order: i,
            }),
          });
        }
      }

      setIsDeleteDialogOpen(false);
      setDeletingQuestionId(null);
      await fetchQuestions();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  }

  async function handleReorder(questionId: string, direction: "up" | "down") {
    if (selectedVersion?.status === "published") {
      setSubmitError("Cannot reorder questions in a published version");
      return;
    }

    const question = questions.find((q) => q.id === questionId);
    if (!question) return;

    const currentIndex = question.question_order;
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= questions.length) return;

    const otherQuestion = questions.find((q) => q.question_order === newIndex);
    if (!otherQuestion) return;

    setReordering(questionId);

    try {
      // Swap orders via API
      await fetch(`/api/admin/assessments/questions/${questionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: question.question_text,
          category: question.category,
          question_order: newIndex,
        }),
      });

      await fetch(`/api/admin/assessments/questions/${otherQuestion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: otherQuestion.question_text,
          category: otherQuestion.category,
          question_order: currentIndex,
        }),
      });

      await fetchQuestions();
    } catch (err) {
      console.error("Error reordering questions:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setReordering(null);
    }
  }

  const isPublished = selectedVersion?.status === "published";

  return (
    <div className="space-y-6">
      {/* Header with Add Question Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Questions</h2>
          <p className="text-muted-foreground mt-1">Build questions for template versions</p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          disabled={!selectedVersionId || isPublished}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Question
        </Button>
      </div>

      {/* Version Selector */}
      <div>
        <label htmlFor="version-select" className="text-sm font-medium">
          Select Template Version <span className="text-destructive">*</span>
        </label>
        <select
          id="version-select"
          value={selectedVersionId}
          onChange={(e) => setSelectedVersionId(e.target.value)}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Select a version</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {(version.template as any)?.name} - {version.version_name} ({version.status})
            </option>
          ))}
        </select>
      </div>

      {selectedVersion && isPublished && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
          <p className="text-sm text-yellow-800">
            This version is published. Questions cannot be edited or reordered.
          </p>
        </div>
      )}

      {/* Questions Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading questions...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : !selectedVersionId ? (
          <div className="p-8 text-center text-muted-foreground">
            Please select a template version to view questions.
          </div>
        ) : questions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No questions found. Click "Add Question" to create your first question.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium w-20">Order</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Question Text</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Category</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question, index) => (
                <tr key={question.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{question.question_order + 1}</span>
                      {!isPublished && (
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleReorder(question.id, "up")}
                            disabled={index === 0 || reordering === question.id}
                            className="p-0.5 hover:bg-muted rounded"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleReorder(question.id, "down")}
                            disabled={index === questions.length - 1 || reordering === question.id}
                            className="p-0.5 hover:bg-muted rounded"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{question.question_text}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {question.category || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {!isPublished && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(question)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(question.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Question Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingQuestionId ? "Edit Question" : "Add Question"}
            </DialogTitle>
            <DialogDescription>
              {editingQuestionId
                ? "Update question information"
                : "Add a new question to this template version"}
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => {
            setIsDialogOpen(false);
            setEditingQuestionId(null);
            setSubmitError(null);
          }} />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="question_text" className="text-sm font-medium">
                Question Text <span className="text-destructive">*</span>
              </label>
              <textarea
                id="question_text"
                name="question_text"
                value={formData.question_text}
                onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                placeholder="Enter your question here..."
                rows={4}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              />
            </div>

            <div>
              <label htmlFor="category" className="text-sm font-medium">
                Category
              </label>
              <Input
                id="category"
                name="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Optional category"
                className="mt-1"
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
                  setEditingQuestionId(null);
                  setSubmitError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingQuestionId ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this question? This action cannot be undone.
              Remaining questions will be automatically reordered.
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => {
            setIsDeleteDialogOpen(false);
            setDeletingQuestionId(null);
          }} />

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingQuestionId(null);
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

