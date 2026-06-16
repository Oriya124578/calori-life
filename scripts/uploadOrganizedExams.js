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

const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2'; // Based on previous report
const courseId = 'logic';
const baseFolder = 'C:\\Users\\turhv\\OneDrive\\שולחן העבודה\\Studies\\year 1\\semester 2\\לוגיקה ותורת הקבוצות\\מבחנים\\מבחני_עבר_מסודרים';

const stringToHex = (str) =>
  Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

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
  if (!fs.existsSync(baseFolder)) {
    console.error("Folder not found:", baseFolder);
    return;
  }
  
  const files = getFilesRecursively(baseFolder);
  let idx = 0;
  
  for (const fullPath of files) {
    const fileName = path.basename(fullPath);
    console.log(`Uploading: ${fileName}`);
    
    const storedName = `${Date.now()}_${stringToHex(fileName)}`;
    const storagePath = `cl_files/${uid}/${courseId}/past_exams/${storedName}`;
    
    // Upload to Firebase Storage
    const buffer = fs.readFileSync(fullPath);
    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      contentType: 'application/pdf',
      metadata: {
        metadata: { originalName: fileName },
      },
    });
    
    // Add to Firestore
    const taskId = `${courseId}_gpast_exams_org_${Date.now()}_${idx}`;
    const docData = {
      id: taskId,
      courseId,
      scope: 'global',
      category: 'past_exams',
      label: fileName,
      checked: false,
      files: [{ name: fileName, path: storagePath }],
      order: 1000 + idx, // keep them at the end
    };
    
    await db.doc(`users/${uid}/cl_courseTasks/${taskId}`).set(docData);
    idx++;
  }
  
  console.log(`\nSuccessfully uploaded ${idx} organized exams to Logic.`);
}

run().catch(console.error).finally(() => process.exit(0));
