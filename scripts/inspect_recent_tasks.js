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
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Find tasks that have files
  const tasksWithFiles = tasks.filter(t => t.files && t.files.length > 0);
  
  console.log(`Total tasks with files: ${tasksWithFiles.length}`);
  
  // Sort tasks by id or any timestamp if exists, or print a few for each course
  const byCourse = {};
  tasksWithFiles.forEach(t => {
    byCourse[t.courseId] = byCourse[t.courseId] || [];
    byCourse[t.courseId].push(t);
  });
  
  for (const [courseId, list] of Object.entries(byCourse)) {
    console.log(`\nCourse: ${courseId} (${list.length} tasks with files)`);
    // Print first 5 tasks
    list.slice(0, 10).forEach(t => {
      console.log(`- Task ID: ${t.id}`);
      console.log(`  Label: ${t.label}`);
      console.log(`  Scope: ${t.scope}, Week: ${t.week}, Category: ${t.category}`);
      console.log(`  Files: ${t.files.map(f => f.name + " -> " + f.path).join(', ')}`);
    });
  }
}

run().catch(console.error).finally(() => process.exit(0));
