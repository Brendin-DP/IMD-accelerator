"use client";

import { 
  Type, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Hash, 
  AlignLeft,
  HelpCircle,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionTypeIconProps {
  type?: string;
  className?: string;
}

const typeIconMap: Record<string, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  long_text: AlignLeft,
  checkbox: CheckSquare,
  date: Calendar,
  number: Hash,
  numeric: Hash,
};

export function QuestionTypeIcon({ type, className }: QuestionTypeIconProps) {
  const Icon = typeIconMap[type?.toLowerCase() || ""] || FileText;
  
  return (
    <Icon 
      className={cn("h-5 w-5 text-muted-foreground", className)} 
    />
  );
}
