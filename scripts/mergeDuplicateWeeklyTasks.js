import admin from 'firebase-admin';
import fs from 'fs';

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
  
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  
  const weeklyTasksByGroup = {};
  
  // Group weekly tasks
  tasksSnap.docs.forEach(doc => {
    const task = doc.data();
    if (task.scope === 'weekly') {
      const type = task.type || task.category; // fallback to category if type is missing
      const key = `${task.courseId}_w${task.week}_${type}`;
      if (!weeklyTasksByGroup[key]) {
        weeklyTasksByGroup[key] = [];
      }
      weeklyTasksByGroup[key].push({ id: doc.id, data: task, ref: doc.ref });
    }
  });
  
  let mergedCount = 0;
  
  for (const key of Object.keys(weeklyTasksByGroup)) {
    const group = weeklyTasksByGroup[key];
    if (group.length > 1) {
      console.log(`\nFound duplicate tasks for ${key} (${group.length} tasks)`);
      
      // Sort so we try to keep the originally seeded empty task as the base
      // The original tasks usually have IDs like "c_sys-w1-lecture-0"
      group.sort((a, b) => {
         if (a.id.includes('-w') && !b.id.includes('-w')) return -1;
         if (!a.id.includes('-w') && b.id.includes('-w')) return 1;
         return a.id.localeCompare(b.id);
      });
      
      const baseTask = group[0];
      const allFiles = [...(baseTask.data.files || [])];
      let isChecked = baseTask.data.checked || false;
      
      const tasksToDelete = [];
      
      for (let i = 1; i < group.length; i++) {
        const otherTask = group[i];
        if (otherTask.data.files) {
          otherTask.data.files.forEach(f => {
            // Add if not already there
            if (!allFiles.find(existing => existing.name === f.name)) {
              allFiles.push(f);
            }
          });
        }
        if (otherTask.data.checked) isChecked = true;
        tasksToDelete.push(otherTask.ref);
      }
      
      // Clean up the label of the base task (e.g. remove " 10" from "הרצאה 10")
      // because the week is already implied by the parent UI.
      let newLabel = baseTask.data.label;
      if (newLabel.includes('הרצאה')) newLabel = 'הרצאה';
      else if (newLabel.includes('תרגול')) newLabel = 'תרגול';
      else if (newLabel.includes('שיעורי בית')) newLabel = 'שיעורי בית';
      
      // Update base task
      await baseTask.ref.update({
        files: allFiles,
        checked: isChecked,
        label: newLabel
      });
      
      // Delete other tasks
      for (const ref of tasksToDelete) {
        await ref.delete();
      }
      
      console.log(`-> Merged into ${baseTask.id} and deleted ${tasksToDelete.length} duplicates. Label set to: ${newLabel}. Files count: ${allFiles.length}`);
      mergedCount++;
    }
  }
  
  console.log(`\nSuccessfully merged ${mergedCount} duplicate task groups!`);
}

run().catch(console.error).finally(() => process.exit(0));
