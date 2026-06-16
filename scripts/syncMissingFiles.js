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
const baseDir = 'C:\\Users\\turhv\\OneDrive\\שולחן העבודה\\Studies\\year 1\\semester 2';

const COURSE_MAP = {
  'תכנות בשפת C': { id: 'c_sys', name: 'תכנות בשפת C', color: 'blue' },
  'אלגברה לינארית 2': { id: 'la_2', name: 'אלגברה לינארית 2', color: 'orange' },
  'לוגיקה ותורת הקבוצות': { id: 'logic', name: 'לוגיקה ותורת הקבוצות', color: 'purple' },
  'אינפי 2': { id: 'calc2', name: 'אינפי 2', color: 'indigo' },
  'מבני נתונים': { id: 'ds', name: 'מבני נתונים', color: 'teal' }
};

const FOLDER_TYPES = {
  'הרצאות': { scope: 'weekly', type: 'lecture', cat: 'lecture', he: 'הרצאה' },
  'תרגולים': { scope: 'weekly', type: 'tutorial', cat: 'practice', he: 'תרגול' },
  'שיעורי בית': { scope: 'weekly', type: 'homework', cat: 'homework', he: 'שיעורי בית' },
  'מבחנים': { scope: 'global', cat: 'past_exams' },
  'בחנים': { scope: 'global', cat: 'quizzes' },
  'סיכומים': { scope: 'global', cat: 'summaries' }
};

const stringToHex = (str) =>
  Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

function extractWeek(filename) {
  const match = filename.match(/(?:הרצאה|תרגול|שיעורי בית|שבוע)\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  const matchNum = filename.match(/(\d+)/);
  if (matchNum) return parseInt(matchNum[1], 10);
  return 1;
}

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(file));
    } else {
      if (file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.zip')) {
        results.push(file);
      }
    }
  });
  return results;
}

async function run() {
  // 1. Get existing file names
  const tasksSnap = await db.collection(`users/${uid}/cl_courseTasks`).get();
  const firebaseFileNames = new Set();
  const existingCoursesSnap = await db.collection(`users/${uid}/cl_courses`).get();
  const existingCourseIds = new Set(existingCoursesSnap.docs.map(d => d.id));
  
  for (const doc of tasksSnap.docs) {
    const task = doc.data();
    if (task.files) {
      for (const file of task.files) {
        firebaseFileNames.add(file.name);
      }
    }
  }

  // 2. Ensure all courses exist
  for (const dirName of Object.keys(COURSE_MAP)) {
    const course = COURSE_MAP[dirName];
    if (!existingCourseIds.has(course.id)) {
      console.log(`Creating missing course: ${course.name}`);
      await db.collection(`users/${uid}/cl_courses`).doc(course.id).set({
        id: course.id,
        name: course.name,
        color: course.color,
        order: existingCourseIds.size + 1,
        uid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      existingCourseIds.add(course.id);
    }
  }

  // 3. Scan local files and upload missing
  const localFiles = getFilesRecursively(baseDir);
  let uploaded = 0;
  
  for (const fullPath of localFiles) {
    const fileName = path.basename(fullPath);
    if (firebaseFileNames.has(fileName)) continue;
    
    const parts = fullPath.split(path.sep);
    const courseDir = parts[parts.indexOf('semester 2') + 1];
    const categoryDir = parts[parts.indexOf('semester 2') + 2];
    
    if (!COURSE_MAP[courseDir]) continue;
    const courseId = COURSE_MAP[courseDir].id;
    
    let mapping = FOLDER_TYPES[categoryDir];
    if (!mapping && categoryDir === 'מבחני_עבר_מסודרים') {
       // nested in logic?
       if (parts.includes('מבחנים')) {
           mapping = FOLDER_TYPES['מבחנים'];
       }
    }
    
    if (!mapping) {
       // Try matching directory names roughly
       if (parts.includes('מבחנים')) mapping = FOLDER_TYPES['מבחנים'];
       else if (parts.includes('בחנים')) mapping = FOLDER_TYPES['בחנים'];
       else if (parts.includes('סיכומים')) mapping = FOLDER_TYPES['סיכומים'];
       else continue;
    }
    
    console.log(`Uploading: ${fileName} -> ${courseId} (${mapping.scope})`);
    
    const storedName = `${Date.now()}_${stringToHex(fileName)}`;
    let storagePath = '';
    let docData = {};
    let taskId = '';
    
    if (mapping.scope === 'weekly') {
      const weekNum = extractWeek(fileName);
      storagePath = `cl_files/${uid}/${courseId}/${mapping.cat}/${storedName}`;
      taskId = `${courseId}_w${weekNum}_${mapping.cat}_${Date.now()}`;
      
      docData = {
        id: taskId,
        courseId,
        scope: 'weekly',
        category: mapping.cat,
        type: mapping.type,
        week: weekNum,
        label: `${mapping.he} ${weekNum}`,
        checked: false,
        files: [{ name: fileName, path: storagePath }],
        order: mapping.type === 'lecture' ? 1 : mapping.type === 'tutorial' ? 2 : 3
      };
    } else {
      storagePath = `cl_files/${uid}/${courseId}/${mapping.cat}/${storedName}`;
      taskId = `${courseId}_g_${mapping.cat}_${Date.now()}`;
      
      docData = {
        id: taskId,
        courseId,
        scope: 'global',
        category: mapping.cat,
        label: fileName,
        checked: false,
        files: [{ name: fileName, path: storagePath }],
        order: Date.now() % 10000
      };
    }
    
    // Upload to Firebase Storage
    const buffer = fs.readFileSync(fullPath);
    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      contentType: fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/zip',
      metadata: {
        metadata: { originalName: fileName },
      },
    });
    
    // Save to Firestore
    await db.doc(`users/${uid}/cl_courseTasks/${taskId}`).set(docData);
    uploaded++;
  }
  
  console.log(`\nSuccessfully synced ${uploaded} missing files and created any missing courses.`);
}

run().catch(console.error).finally(() => process.exit(0));
