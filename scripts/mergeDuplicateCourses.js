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
  
  const mappings = [
    { from: 'calc2', to: 'infi2' },
    { from: 'ds', to: 'data_structures' }
  ];
  
  let updatedCount = 0;
  
  for (const { from, to } of mappings) {
    console.log(`Merging ${from} into ${to}...`);
    const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`)
      .where('courseId', '==', from)
      .get();
      
    for (const doc of tasksSnap.docs) {
      const data = doc.data();
      const newId = data.id.replace(from, to);
      const newData = { ...data, courseId: to, id: newId };
      await db.collection(`users/${uid}/cl_courseTasks`).doc(newId).set(newData);
      await doc.ref.delete();
      updatedCount++;
    }
    
    // Delete the duplicate course doc
    await db.collection(`users/${uid}/cl_courses`).doc(from).delete();
  }
  
  console.log(`Successfully merged ${updatedCount} tasks into their proper courses and deleted the duplicate courses.`);
}

run().catch(console.error).finally(() => process.exit(0));
