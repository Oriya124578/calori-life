import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = {};
try {
  fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const SUPABASE_URL = env['VITE_SUPABASE_URL'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  const { data: rows, error } = await supabase.from('user_data').select('id, app_state');
  if (error || !rows?.length) {
    console.error('Could not load user_data:', error?.message || 'no rows');
    process.exit(1);
  }
  
  const appState = rows[0].app_state;
  const courses = appState.courses || [];
  
  console.log("# Calori Life - Physical Files Report in App\n");
  
  for (const course of courses) {
    console.log(`## Course: ${course.name} (${course.id})`);
    
    // Check lectures and tutorials
    const tasks = appState.tasks?.[course.id] || {};
    let hasFiles = false;
    
    for (const week of Object.keys(tasks).sort((a,b)=>Number(a)-Number(b))) {
      const weekTasks = tasks[week] || [];
      const relevantTasks = weekTasks.filter(t => t.type === 'lecture' || t.type === 'tutorial');
      
      for (const t of relevantTasks) {
        if (t.files && t.files.length > 0) {
          console.log(`- Week ${week} [${t.type}]: ${t.files.map(f => f.name).join(', ')}`);
          hasFiles = true;
        }
      }
    }
    
    if (!hasFiles) {
      console.log(`- No lectures or tutorials uploaded yet.`);
    }
    console.log("\n");
  }
}

run().catch(console.error);
