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

const baseDir = 'C:\\Users\\turhv\\OneDrive\\שולחן העבודה\\Studies\\year 1\\semester 2';

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(file));
    } else {
      if (file.toLowerCase().endsWith('.pdf')) {
        results.push(file);
      }
    }
  });
  return results;
}

async function run() {
  const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2'; // Active user
  
  // 1. Get all file names currently in Firebase
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  const firebaseFileNames = new Set();
  
  for (const doc of tasksSnap.docs) {
    const task = doc.data();
    if (task.files) {
      for (const file of task.files) {
        firebaseFileNames.add(file.name);
      }
    }
  }
  
  // 2. Scan local files
  console.log(`Scanning local files in ${baseDir}...\n`);
  const localFiles = getFilesRecursively(baseDir);
  
  const newFiles = [];
  
  for (const fullPath of localFiles) {
    const fileName = path.basename(fullPath);
    if (!firebaseFileNames.has(fileName)) {
      newFiles.push({ name: fileName, path: fullPath });
    }
  }
  
  if (newFiles.length === 0) {
    console.log("No new missing files found. Firebase is 100% up to date with the local OneDrive folder!");
  } else {
    console.log(`Found ${newFiles.length} files that are NOT in the app yet:`);
    newFiles.forEach(f => console.log(`- ${f.name} (in ${path.basename(path.dirname(f.path))})`));
  }
}

run().catch(console.error).finally(() => process.exit(0));
