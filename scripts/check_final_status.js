import admin from 'firebase-admin';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2';
  
  // 1. Get all courses
  const coursesSnap = await db.collection(`users/${uid}/cl_courses`).get();
  console.log("=== COURSES ===");
  coursesSnap.docs.forEach(d => {
    console.log(`- ${d.id}: ${d.data().name}`);
  });
  
  // 2. Get tasks with files
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const withFiles = tasks.filter(t => t.files && t.files.length > 0);
  
  console.log("\n=== TASKS WITH FILES PER COURSE ===");
  const grouped = {};
  withFiles.forEach(t => {
    grouped[t.courseId] = grouped[t.courseId] || [];
    grouped[t.courseId].push(t);
  });
  
  // Only display details for infi2, data_structures, and c_sys
  const filterCourses = ['infi2', 'data_structures', 'c_sys'];
  
  for (const [courseId, list] of Object.entries(grouped)) {
    if (!filterCourses.includes(courseId)) {
      console.log(`\nCourse: ${courseId} (${list.length} tasks with files) -> [Skipping detailed output]`);
      continue;
    }
    console.log(`\nCourse: ${courseId} (${list.length} tasks with files)`);
    list.sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === 'weekly' ? -1 : 1;
      if (a.scope === 'weekly') return a.week - b.week;
      return String(a.category).localeCompare(String(b.category));
    });
    
    list.forEach(t => {
      console.log(`  - ${t.scope === 'weekly' ? 'Week ' + t.week : t.category} [${t.type || 'global'}]: ${t.files.map(f => f.name).join(', ')}`);
    });
  }
}

run().catch(console.error).finally(() => process.exit(0));
