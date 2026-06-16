import admin from 'firebase-admin';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2'; // Active user
  const coursesSnap = await db.collection(`users/${uid}/cl_courses`).get();
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  
  const courses = coursesSnap.docs.map(d => d.data());
  const tasks = tasksSnap.docs.map(d => d.data());
  
  console.log(`=== Full File Report for Active Account ===\n`);
  
  for (const course of courses) {
    console.log(`## Course: ${course.name} (${course.id})`);
    const courseTasks = tasks.filter(t => t.courseId === course.id);
    
    let hasFiles = false;
    const weeklyTasks = courseTasks.filter(t => t.scope === 'weekly' && t.files && t.files.length > 0);
    if (weeklyTasks.length > 0) {
      console.log(`\n  --- Weekly Files (Lectures, Tutorials, Homework) ---`);
      hasFiles = true;
      const byWeek = {};
      for (const t of weeklyTasks) {
        if (!byWeek[t.week]) byWeek[t.week] = [];
        byWeek[t.week].push(t);
      }
      for (const week of Object.keys(byWeek).sort((a,b)=>Number(a)-Number(b))) {
        for (const t of byWeek[week]) {
          console.log(`  - Week ${week} [${t.type}]: ${t.files.map(f => f.name).join(', ')}`);
        }
      }
    }
    
    const globalTasks = courseTasks.filter(t => t.scope === 'global' && t.files && t.files.length > 0);
    if (globalTasks.length > 0) {
      console.log(`\n  --- Global Files (Exams, Summaries, Quizzes) ---`);
      hasFiles = true;
      const byCat = {};
      for (const t of globalTasks) {
        if (!byCat[t.category]) byCat[t.category] = [];
        byCat[t.category].push(t);
      }
      for (const cat of Object.keys(byCat)) {
        console.log(`  [Category: ${cat}]`);
        for (const t of byCat[cat]) {
          console.log(`    - ${t.files.map(f => f.name).join(', ')}`);
        }
      }
    }
    
    if (!hasFiles) {
      console.log(`  - No files uploaded yet.`);
    }
    console.log('\n');
  }
}

run().catch(console.error).finally(() => process.exit(0));
