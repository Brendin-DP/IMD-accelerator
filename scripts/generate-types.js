#!/usr/bin/env node

/**
 * Script to generate TypeScript types from Supabase database schema
 * 
 * Usage:
 *   npm run generate:types
 *   npm run generate:types:local (for local Supabase)
 *   SUPABASE_PROJECT_ID=your-project-id npm run generate:types
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get project ID from environment variable or extract from URL
function getProjectId() {
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
        process.exit(1);
      }
      
      console.log(`🔄 Generating types from Supabase project: ${projectId}...`);
      command = `npx supabase gen types typescript --project-id ${projectId}`;
    }

    // Generate types
    const types = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    
    // Write to file
    fs.writeFileSync(outputPath, types, 'utf-8');
    
    console.log(`✅ Types generated successfully!`);
    console.log(`   Output: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error generating types:', error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  }
}

generateTypes();

