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
  
  // Get all tasks for la_2
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`)
    .where('courseId', '==', 'la_2')
    .get();
    
  let updatedCount = 0;
  for (const doc of tasksSnap.docs) {
    const data = doc.data();
    const newId = data.id.replace('la_2', 'linear2');
    
    // Create new doc with linear2
    const newData = { ...data, courseId: 'linear2', id: newId };
    await db.collection(`users/${uid}/cl_courseTasks`).doc(newId).set(newData);
    
    // Delete old doc
    await doc.ref.delete();
    updatedCount++;
  }
  
  // Delete the la_2 course
  await db.collection(`users/${uid}/cl_courses`).doc('la_2').delete();
  
  console.log(`Successfully migrated ${updatedCount} tasks from la_2 to linear2 and deleted the duplicate course.`);
}

run().catch(console.error).finally(() => process.exit(0));
