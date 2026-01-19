-- Fix assessment_reports upsert issue by adding unique constraint
-- This ensures upsert works correctly with onConflict: "participant_assessment_id,report_type"

-- First, check if there are any duplicate rows that would prevent the constraint
-- If duplicates exist, you'll need to resolve them first
SELECT 
  participant_assessment_id, 
  report_type, 
  COUNT(*) as count
FROM assessment_reports
GROUP BY participant_assessment_id, report_type
HAVING COUNT(*) > 1;

-- If the above query returns rows, you need to delete duplicates first
-- Keep the most recent one (highest updated_at)
-- Example cleanup (uncomment and modify if needed):
/*
DELETE FROM assessment_reports a
USING assessment_reports b
WHERE a.id < b.id
  AND a.participant_assessment_id = b.participant_assessment_id
  AND a.report_type = b.report_type;
*/

-- Create unique index/constraint if it doesn't exist
-- This will allow upsert to work properly
CREATE UNIQUE INDEX IF NOT EXISTS assessment_reports_unique_pa_type
ON public.assessment_reports (participant_assessment_id, report_type);

-- Verify the constraint was created
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'assessment_reports' 
  AND indexname = 'assessment_reports_unique_pa_type';
