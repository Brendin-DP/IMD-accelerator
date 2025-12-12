"use client";

import { useState, useEffect } from "react";
import { Plus, ArrowUp, ArrowDown, MoreVertical, Edit, Trash2 } from "lucide-react";
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
import { supabase } from "@/lib/supabaseClient";
import { useTableSort } from "@/hooks/useTableSort";

interface User {
  id: string;
  email: string;
  name?: string;
  surname?: string;
  role?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const { sortedData: sortedUsers, sortConfig, handleSort } = useTableSort(users);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    surname: "",
    email: "",
    role: "",
    status: "active",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    surname: "",
    email: "",
    role: "",
    status: "active",
    password: "",
  });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      setError(null);
      
      // Query imd_users table
      const { data, error: dbError } = await supabase
        .from("imd_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching users:", dbError);
        setError(`Failed to load users: ${dbError.message}`);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleEditInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setEditing(true);
    setEditError(null);

    try {
      // Prepare update data
      const updateData: any = {
        name: editFormData.name.trim(),
        surname: editFormData.surname.trim(),
        email: editFormData.email.toLowerCase().trim(),
        role: editFormData.role || null,
        status: editFormData.status || "active",
      };

      // Add password if provided (temp workaround - set password_hash directly)
      if (editFormData.password && editFormData.password.trim() !== "") {
        updateData.password_hash = editFormData.password.trim();
      }

      const { error: updateError } = await supabase
        .from("imd_users")
        .update(updateData)
        .eq("id", editingUser.id);

      if (updateError) {
        console.error("Error updating user:", updateError);
        setEditError(`Failed to update user: ${updateError.message}`);
        setEditing(false);
        return;
      }

      // Reset form and close dialog
      setEditFormData({
        name: "",
        surname: "",
        email: "",
        role: "",
        status: "active",
        password: "",
      });
      setEditingUser(null);
      setIsEditDialogOpen(false);
      
      // Refresh users list
      await fetchUsers();
    } catch (err) {
      console.error("Unexpected error:", err);
      setEditError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setEditing(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }

    setDeletingUserId(userId);

    try {
      const { error: deleteError } = await supabase
        .from("imd_users")
        .delete()
        .eq("id", userId);

      if (deleteError) {
        console.error("Error deleting user:", deleteError);
        alert(`Failed to delete user: ${deleteError.message}`);
      } else {
        // Refresh users list
        await fetchUsers();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      alert(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Prepare user data
      const userData: any = {
        name: formData.name.trim(),
        surname: formData.surname.trim(),
        email: formData.email.toLowerCase().trim(),
        role: formData.role || null,
        status: formData.status || "active",
      };

      // Add password if provided
      if (formData.password && formData.password.trim() !== "") {
        userData.password_hash = formData.password.trim();
      }

      const { data, error: insertError } = await supabase
        .from("imd_users")
        .insert([userData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating user:", insertError);
        setSubmitError(`Failed to create user: ${insertError.message}`);
        setSubmitting(false);
        return;
      }

      // Reset form and close dialog
      setFormData({
        name: "",
        surname: "",
        email: "",
        role: "",
        status: "active",
        password: "",
      });
      setIsDialogOpen(false);
      
      // Refresh users list
      await fetchUsers();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add User Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-2">Manage users and permissions</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Users Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading users...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No users found. Click "Add User" to create your first user.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-2">
                    Name
                    {sortConfig.key === "name" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("surname")}
                >
                  <div className="flex items-center gap-2">
                    Surname
                    {sortConfig.key === "surname" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("email")}
                >
                  <div className="flex items-center gap-2">
                    Email
                    {sortConfig.key === "email" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("role")}
                >
                  <div className="flex items-center gap-2">
                    Role
                    {sortConfig.key === "role" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-2">
                    Status
                    {sortConfig.key === "status" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("created_at")}
                >
                  <div className="flex items-center gap-2">
                    Created
                    {sortConfig.key === "created_at" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">{user.name || "-"}</td>
                  <td className="px-6 py-4 text-sm font-medium">{user.surname || "-"}</td>
                  <td className="px-6 py-4 text-sm">{user.email || "-"}</td>
                  <td className="px-6 py-4 text-sm">
                    {user.role ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                        {user.role}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {user.status ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          user.status === "active"
                            ? "bg-green-100 text-green-800"
                            : user.status === "inactive"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {user.status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingUser(user);
                            setEditFormData({
                              name: user.name || "",
                              surname: user.surname || "",
                              email: user.email || "",
                              role: user.role || "",
                              status: user.status || "active",
                              password: "",
                            });
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (deletingUserId === user.id) return;
                            handleDeleteUser(user.id);
                          }}
                          aria-disabled={deletingUserId === user.id}
                          className={`text-destructive ${deletingUserId === user.id ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingUserId === user.id ? "Deleting..." : "Delete User"}
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

      {/* Add User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user by filling in the information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2.5">
              <label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="First name"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="surname" className="text-sm font-medium">
                Surname <span className="text-destructive">*</span>
              </label>
              <Input
                id="surname"
                name="surname"
                value={formData.surname}
                onChange={handleInputChange}
                required
                placeholder="Last name"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password <span className="text-destructive">*</span>
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                placeholder="Enter password"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <Input
                id="role"
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                placeholder="e.g., admin, manager"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full border border-input bg-background px-3 py-2 rounded-md text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => {
            setIsEditDialogOpen(false);
            setEditingUser(null);
            setEditFormData({
              name: "",
              surname: "",
              email: "",
              role: "",
              status: "active",
              password: "",
            });
            setEditError(null);
          }} />
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information below. Leave password blank to keep current password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2.5">
              <label htmlFor="edit_name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_name"
                name="name"
                value={editFormData.name}
                onChange={handleEditInputChange}
                required
                placeholder="First name"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="edit_surname" className="text-sm font-medium">
                Surname <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_surname"
                name="surname"
                value={editFormData.surname}
                onChange={handleEditInputChange}
                required
                placeholder="Last name"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="edit_email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_email"
                name="email"
                type="email"
                value={editFormData.email}
                onChange={handleEditInputChange}
                required
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="edit_password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="edit_password"
                name="password"
                type="password"
                value={editFormData.password}
                onChange={handleEditInputChange}
                placeholder="Leave blank to keep current password"
              />
              <p className="text-xs text-muted-foreground">
                This will update the password_hash field in the database. The password will be stored as plain text (temporary workaround).
              </p>
            </div>

            <div className="space-y-2.5">
              <label htmlFor="edit_role" className="text-sm font-medium">
                Role
              </label>
              <Input
                id="edit_role"
                name="role"
                value={editFormData.role}
                onChange={handleEditInputChange}
                placeholder="e.g., admin, manager"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="edit_status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="edit_status"
                name="status"
                value={editFormData.status}
                onChange={handleEditInputChange}
                className="w-full border border-input bg-background px-3 py-2 rounded-md text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingUser(null);
                  setEditFormData({
                    name: "",
                    surname: "",
                    email: "",
                    role: "",
                    status: "active",
                    password: "",
                  });
                  setEditError(null);
                }}
                disabled={editing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editing}>
                {editing ? "Updating..." : "Update User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

