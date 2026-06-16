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
  
  const courseTaskCounts = {};
  tasksSnap.docs.forEach(d => {
    const task = d.data();
    courseTaskCounts[task.courseId] = (courseTaskCounts[task.courseId] || 0) + 1;
  });
  
  console.log("Tasks count per course in Firestore:");
  for (const [courseId, count] of Object.entries(courseTaskCounts)) {
    console.log(`- ${courseId}: ${count} tasks`);
  }
}

run().catch(console.error).finally(() => process.exit(0));
