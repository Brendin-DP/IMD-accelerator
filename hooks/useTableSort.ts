import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortConfig<T> {
  key: keyof T | null;
  direction: SortDirection;
}

export function useTableSort<T>(data: T[], defaultSort?: SortConfig<T>) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>(
    defaultSort || { key: null, direction: null }
  );

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return data;
    }

    const sorted = [...data].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Handle nested objects (e.g., user.name)
      const aComparable = typeof aValue === "object" && aValue !== null
        ? String((aValue as any)?.name || (aValue as any)?.email || aValue)
        : aValue;
      const bComparable = typeof bValue === "object" && bValue !== null
        ? String((bValue as any)?.name || (bValue as any)?.email || bValue)
        : bValue;

      // Compare values
      if (aComparable < bComparable) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aComparable > bComparable) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [data, sortConfig]);

  const handleSort = (key: keyof T) => {
    let direction: SortDirection = "asc";
    
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    } else if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = null;
    }

    setSortConfig({ key: direction ? key : null, direction });
  };

  return {
    sortedData,
    sortConfig,
    handleSort,
  };
}

