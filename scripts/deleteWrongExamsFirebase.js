import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("No service account found at " + SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(PROJECT_ROOT, '.env.local'));

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_STORAGE_BUCKET = process.env.VITE_FIREBASE_STORAGE_BUCKET;

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2';
const courseId = 'logic';
const baseFolder = 'C:\\Users\\turhv\\OneDrive\\שולחן העבודה\\Studies\\year 1\\semester 2\\לוגיקה ותורת הקבוצות\\מבחנים';

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
        results.push(path.basename(file));
      }
    }
  });
  return results;
}

async function run() {
  const localFileNames = new Set(getFilesRecursively(baseFolder));
  
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`)
    .where('courseId', '==', courseId)
    .where('category', '==', 'past_exams')
    .get();
    
  let deletedCount = 0;
  
  for (const doc of tasksSnap.docs) {
    const task = doc.data();
    const fileName = task.label;
    
    if (!localFileNames.has(fileName)) {
      console.log(`Deleting extra file: ${fileName}`);
      
      // Delete from storage
      if (task.files && task.files.length > 0) {
        for (const file of task.files) {
          try {
            await bucket.file(file.path).delete();
            console.log(`  - Deleted from storage: ${file.path}`);
          } catch (err) {
            console.error(`  - Failed to delete from storage: ${file.path}`, err.message);
          }
        }
      }
      
      // Delete from firestore
      await doc.ref.delete();
      deletedCount++;
    }
  }
  
  console.log(`\nSuccessfully deleted ${deletedCount} extra exams from Firebase.`);
}

run().catch(console.error).finally(() => process.exit(0));
