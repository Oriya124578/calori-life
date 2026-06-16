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
  const coursesSnap = await db.collection(`users/${uid}/cl_courses`).get();
  console.log("Courses in Firestore:");
  coursesSnap.docs.forEach(d => {
    console.log(`- ${d.id}: ${JSON.stringify(d.data())}`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
