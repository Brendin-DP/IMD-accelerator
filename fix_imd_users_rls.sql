-- Fix RLS policy for imd_users table to allow login queries
-- Run this in your Supabase SQL Editor

-- First, check if RLS is enabled
-- ALTER TABLE imd_users ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows anonymous users to SELECT from imd_users for login purposes
-- This allows anyone to query the table (needed for login), but you can restrict it further if needed
CREATE POLICY "Allow anonymous SELECT for login"
ON imd_users
FOR SELECT
TO anon
USING (true);

-- If you want to be more restrictive, you can create a policy that only allows 
-- reading specific columns (excluding sensitive data):
-- CREATE POLICY "Allow anonymous SELECT for login"
-- ON imd_users
-- FOR SELECT
-- TO anon
-- USING (true)
-- WITH CHECK (true);

-- Note: For production, consider creating a secure database function instead
-- that handles authentication server-side rather than exposing password_hash

