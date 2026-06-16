import admin from 'firebase-admin';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'calori1300.firebasestorage.app'
});

const bucket = admin.storage().bucket();

async function run() {
  const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2';
  const prefix = `cl_files/${uid}/`;
  const [files] = await bucket.getFiles({ prefix });
  
  const courseMap = {};
  files.forEach(file => {
    // path is cl_files/{uid}/{courseId}/{folder}/{filename}
    const parts = file.name.split('/');
    if (parts.length > 2) {
      const courseId = parts[2];
      courseMap[courseId] = (courseMap[courseId] || 0) + 1;
    }
  });
  
  console.log("Files count per course in Firebase Storage:");
  for (const [courseId, count] of Object.entries(courseMap)) {
    console.log(`- ${courseId}: ${count} files`);
  }
}

run().catch(console.error).finally(() => process.exit(0));
