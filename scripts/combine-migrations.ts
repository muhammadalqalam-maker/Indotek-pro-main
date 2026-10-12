import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let combined = '-- =============================================================================\n-- INDOTEK PRO - FULL CONSOLIDATED SUPABASE MIGRATION\n-- =============================================================================\n\n';

for (const file of files) {
  combined += '\n\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n';
  combined += `-- START: ${file}\n`;
  combined += '-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n';
  combined += fs.readFileSync(path.join(dir, file), 'utf8');
}

const target = path.join(process.cwd(), 'supabase', 'all_migrations_combined.sql');
fs.writeFileSync(target, combined, 'utf8');
console.log(`Combined migrations written successfully to ${target} (${combined.length} bytes)`);
