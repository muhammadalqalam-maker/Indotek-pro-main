#!/usr/bin/env tsx
/**
 * RPC Catalog Auditor
 * 
 * Extracts all public RPC function signatures from migration files,
 * cross-references with client-side .rpc() invocations,
 * reports mismatches, orphaned calls, and undefined functions.
 * 
 * Phase B: npm run check:rpc validation for CI
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RpcFunction {
  name: string;
  file: string;
  lineStart: number;
  signature: string;
  params: string[];
  returnType: string;
}

interface RpcCall {
  name: string;
  file: string;
  line: number;
  context: string;
}

interface AuditReport {
  defined: RpcFunction[];
  called: RpcCall[];
  orphanedCalls: RpcCall[]; // called but not defined
  unusedFunctions: RpcFunction[]; // defined but never called
  summary: {
    totalDefined: number;
    totalCalled: number;
    totalOrphaned: number;
    totalUnused: number;
  };
}

const MIGRATIONS_DIR = resolve(__dirname, '../supabase/migrations');
const SRC_DIR = resolve(__dirname, '../src');

/**
 * Extract public RPC functions from migration file
 * Handles multi-line CREATE OR REPLACE FUNCTION declarations
 */
function extractRpcFunctions(filePath: string): RpcFunction[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const functions: RpcFunction[] = [];
  
  const functionRegex = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(functionRegex);
    
    if (match) {
      const funcName = match[1];
      
      // Capture complete function signature (multi-line)
      let signature = line;
      let j = i + 1;
      
      // Continue until we find the closing ) followed by returns
      while (j < lines.length && !lines[j].match(/\)\s*returns/i)) {
        signature += '\n' + lines[j];
        j++;
      }
      
      // Include the returns line
      if (j < lines.length) {
        signature += '\n' + lines[j];
      }
      
      // Extract parameters from signature
      const paramsMatch = signature.match(/\((.*?)\)\s*returns/is);
      const paramsStr = paramsMatch ? paramsMatch[1].trim() : '';
      
      // Parse individual parameters
      const params: string[] = [];
      if (paramsStr) {
        // Split on comma, but respect nested parentheses
        let depth = 0;
        let currentParam = '';
        
        for (const char of paramsStr) {
          if (char === '(') depth++;
          if (char === ')') depth--;
          
          if (char === ',' && depth === 0) {
            if (currentParam.trim()) {
              params.push(currentParam.trim());
            }
            currentParam = '';
          } else {
            currentParam += char;
          }
        }
        
        if (currentParam.trim()) {
          params.push(currentParam.trim());
        }
      }
      
      // Extract return type
      const returnMatch = signature.match(/returns\s+(.*?)(?:language|as|$)/is);
      const returnType = returnMatch ? returnMatch[1].trim() : 'void';
      
      functions.push({
        name: funcName,
        file: filePath.replace(MIGRATIONS_DIR + '/', ''),
        lineStart: i + 1,
        signature: signature.trim(),
        params: params.map(p => {
          // Extract parameter name and type
          const parts = p.trim().split(/\s+/);
          const paramName = parts[0];
          const paramType = parts.slice(1).join(' ');
          return `${paramName} ${paramType}`;
        }),
        returnType
      });
    }
  }
  
  return functions;
}

/**
 * Extract .rpc() calls from TypeScript/JavaScript files
 */
function extractRpcCalls(dirPath: string): RpcCall[] {
  const calls: RpcCall[] = [];
  
  function scanDirectory(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        scanFile(fullPath);
      }
    }
  }
  
  function scanFile(filePath: string) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Match .rpc('function_name', ...)
    const rpcRegex = /\.rpc\s*\(\s*['"`](\w+)['"`]/g;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      
      while ((match = rpcRegex.exec(line)) !== null) {
        calls.push({
          name: match[1],
          file: filePath.replace(SRC_DIR + '/', ''),
          line: i + 1,
          context: line.trim()
        });
      }
    }
  }
  
  scanDirectory(dirPath);
  return calls;
}

/**
 * Main audit function
 */
function auditRpcCatalog(): AuditReport {
  console.log('🔍 Scanning migration files for RPC definitions...\n');
  
  // Extract all RPC functions from migrations
  const definedFunctions: RpcFunction[] = [];
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const file of migrationFiles) {
    const filePath = join(MIGRATIONS_DIR, file);
    const functions = extractRpcFunctions(filePath);
    
    if (functions.length > 0) {
      console.log(`  ${file}: ${functions.length} public RPCs`);
      definedFunctions.push(...functions);
    }
  }
  
  console.log(`\n✅ Found ${definedFunctions.length} defined public RPCs\n`);
  
  // Extract all .rpc() calls from src/
  console.log('🔍 Scanning src/ for .rpc() invocations...\n');
  const calls = extractRpcCalls(SRC_DIR);
  
  console.log(`✅ Found ${calls.length} .rpc() call sites\n`);
  
  // Cross-reference
  const definedNames = new Set(definedFunctions.map(f => f.name));
  const calledNames = new Set(calls.map(c => c.name));
  
  const orphanedCalls = calls.filter(c => !definedNames.has(c.name));
  const unusedFunctions = definedFunctions.filter(f => !calledNames.has(f.name));
  
  return {
    defined: definedFunctions,
    called: calls,
    orphanedCalls,
    unusedFunctions,
    summary: {
      totalDefined: definedFunctions.length,
      totalCalled: calls.length,
      totalOrphaned: orphanedCalls.length,
      totalUnused: unusedFunctions.length
    }
  };
}

/**
 * Print audit report
 */
function printReport(report: AuditReport) {
  console.log('═'.repeat(80));
  console.log('RPC CATALOG AUDIT REPORT');
  console.log('═'.repeat(80));
  console.log();
  
  console.log('📊 SUMMARY');
  console.log('─'.repeat(80));
  console.log(`  Defined RPCs:      ${report.summary.totalDefined}`);
  console.log(`  Called RPCs:       ${report.summary.totalCalled} (.rpc() invocations)`);
  console.log(`  Orphaned calls:    ${report.summary.totalOrphaned} (called but not defined)`);
  console.log(`  Unused functions:  ${report.summary.totalUnused} (defined but never called)`);
  console.log();
  
  if (report.orphanedCalls.length > 0) {
    console.log('❌ ORPHANED CALLS (called but not defined in migrations)');
    console.log('─'.repeat(80));
    
    const grouped = new Map<string, RpcCall[]>();
    report.orphanedCalls.forEach(call => {
      if (!grouped.has(call.name)) {
        grouped.set(call.name, []);
      }
      grouped.get(call.name)!.push(call);
    });
    
    for (const [funcName, calls] of grouped) {
      console.log(`\n  ${funcName}:`);
      calls.forEach(call => {
        console.log(`    ${call.file}:${call.line}`);
        console.log(`      ${call.context}`);
      });
    }
    console.log();
  }
  
  if (report.unusedFunctions.length > 0) {
    console.log('⚠️  UNUSED FUNCTIONS (defined but never called from client)');
    console.log('─'.repeat(80));
    console.log('Note: Some RPCs may be called from other contexts (triggers, cron, etc.)\n');
    
    report.unusedFunctions.forEach(func => {
      console.log(`  ${func.name}`);
      console.log(`    ${func.file}:${func.lineStart}`);
      console.log(`    Returns: ${func.returnType}`);
      console.log(`    Params: ${func.params.length > 0 ? func.params.join(', ') : '(none)'}`);
      console.log();
    });
  }
  
  console.log('═'.repeat(80));
  
  // Exit with error if orphaned calls found
  if (report.summary.totalOrphaned > 0) {
    console.error(`\n❌ FAILED: ${report.summary.totalOrphaned} orphaned RPC calls detected`);
    process.exit(1);
  }
  
  console.log('\n✅ PASSED: All client RPC calls are defined');
  process.exit(0);
}

// Main execution
try {
  const report = auditRpcCatalog();
  printReport(report);
} catch (error) {
  console.error('❌ Audit failed:', error);
  process.exit(1);
}
