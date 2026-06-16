import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

async function run() {
  const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2';
  
  const coursesSnap = await db.collection(`users/${uid}/cl_courses`).get();
  console.log(`Found ${coursesSnap.size} courses:`);
  
  const validCourses = new Set();
  coursesSnap.docs.forEach(doc => {
    validCourses.add(doc.id);
    console.log(`- ${doc.data().name} (ID: ${doc.id})`);
  });
  
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  console.log(`\nFound ${tasksSnap.size} total tasks.`);
  
  const filesByCourse = {};
  validCourses.forEach(id => filesByCourse[id] = []);
  
  let issuesFound = 0;
  
  tasksSnap.docs.forEach(doc => {
    const task = doc.data();
    
    // Check if task belongs to a valid course
    if (!validCourses.has(task.courseId)) {
      console.log(`[!] ERROR: Task ${task.id} belongs to a ghost course: ${task.courseId}`);
      issuesFound++;
    } else {
      if (task.files && task.files.length > 0) {
        task.files.forEach(f => {
          filesByCourse[task.courseId].push({
            taskDocId: doc.id,
            fileName: f.name,
            label: task.label,
            category: task.category,
            week: task.week
          });
        });
      }
    }
  });
  
  console.log('\nChecking for duplicates...');
  
  Object.keys(filesByCourse).forEach(courseId => {
    const files = filesByCourse[courseId];
    const seenNames = new Set();
    const seenWeeklyType = new Set(); // To prevent duplicate "lecture 10" etc.
    
    files.forEach(f => {
      // Check duplicate filename
      if (seenNames.has(f.fileName)) {
        console.log(`[!] DUPLICATE FILE NAME in ${courseId}: ${f.fileName} (Task: ${f.taskDocId})`);
        issuesFound++;
      }
      seenNames.add(f.fileName);
      
      // Check duplicate weekly type (e.g., two Lecture 10s)
      if (f.week && f.category) {
         const key = `${f.category}_week${f.week}`;
         if (seenWeeklyType.has(key)) {
            // It's possible there's part 1 and part 2, but usually it's a duplicate task
            console.log(`[?] WARNING: Multiple files for ${courseId} - ${f.category} week ${f.week} -> ${f.fileName}`);
         }
         seenWeeklyType.add(key);
      }
    });
  });
  
  console.log(`\nVerification complete. Found ${issuesFound} issues.`);
}

run().catch(console.error).finally(() => process.exit(0));
