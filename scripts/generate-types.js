#!/usr/bin/env node

/**
 * Script to generate TypeScript types from Supabase database schema
 * 
 * Usage:
 *   npm run generate:types
 *   npm run generate:types:local (for local Supabase)
 *   SUPABASE_PROJECT_ID=your-project-id npm run generate:types
 *   SUPABASE_ACCESS_TOKEN=your-token SUPABASE_PROJECT_ID=your-project-id npm run generate:types
 * 
 * Authentication:
 *   - Option 1: Run 'npx supabase login' first
 *   - Option 2: Set SUPABASE_ACCESS_TOKEN environment variable
 *     Get token from: https://supabase.com/dashboard/account/tokens
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Try to load environment variables from .env files
function loadEnvFiles() {
  const envFiles = ['.env.local', '.env'];
  const rootDir = path.join(__dirname, '..');
  
  for (const envFile of envFiles) {
    const envPath = path.join(rootDir, envFile);
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
              if (!process.env[key]) {
                process.env[key] = value;
              }
            }
          }
        }
      }
    } catch (error) {
      // Silently continue if we can't read the file (permissions, etc.)
      // Environment variables may already be set via other means
    }
  }
}

// Get project ID from environment variable or extract from URL
function getProjectId() {
  // Load .env files first
  loadEnvFiles();
  
  // Check if project ID is provided directly
  if (process.env.SUPABASE_PROJECT_ID) {
    return process.env.SUPABASE_PROJECT_ID;
  }

  // Try to extract from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    // Extract project ID from URL like: https://xxxxx.supabase.co
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function generateTypes() {
  const outputPath = path.join(__dirname, '../src/types/database.types.ts');
  const isLocal = process.argv.includes('--local');

  try {
    let command;
    let env = { ...process.env };
    
    if (isLocal) {
      console.log('🔄 Generating types from local Supabase instance...');
      command = 'npx supabase gen types typescript --local';
    } else {
      const projectId = getProjectId();
      if (!projectId) {
        console.error('❌ Error: Could not determine Supabase project ID.');
        console.error('   Please set SUPABASE_PROJECT_ID environment variable or');
        console.error('   ensure NEXT_PUBLIC_SUPABASE_URL is set in your .env file.');
        console.error('\n   Example:');
        console.error('   SUPABASE_PROJECT_ID=your-project-id npm run generate:types');
        console.error('   Or with access token:');
        console.error('   SUPABASE_ACCESS_TOKEN=your-token SUPABASE_PROJECT_ID=your-project-id npm run generate:types');
        process.exit(1);
      }
      
      // Check for access token
      const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
      if (accessToken) {
        console.log(`🔄 Generating types from Supabase project: ${projectId} (using access token)...`);
        env.SUPABASE_ACCESS_TOKEN = accessToken;
      } else {
        console.log(`🔄 Generating types from Supabase project: ${projectId}...`);
        console.log('   Note: If authentication fails, set SUPABASE_ACCESS_TOKEN environment variable');
      }
      
      command = `npx supabase gen types typescript --project-id ${projectId}`;
    }

    // Generate types with environment variables
    const types = execSync(command, { 
      encoding: 'utf-8', 
      stdio: 'pipe',
      env: env
    });
    
    // Write to file
    fs.writeFileSync(outputPath, types, 'utf-8');
    
    console.log(`✅ Types generated successfully!`);
    console.log(`   Output: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error generating types:', error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    
    // Provide helpful error message for authentication issues
    if (error.stderr && error.stderr.includes('privileges') || error.stderr.includes('access-control')) {
      console.error('\n💡 Tip: Authentication required. Try one of these:');
      console.error('   1. Run: npx supabase login');
      console.error('   2. Or set SUPABASE_ACCESS_TOKEN environment variable');
      console.error('      Get your token from: https://supabase.com/dashboard/account/tokens');
    }
    
    process.exit(1);
  }
}

generateTypes();

