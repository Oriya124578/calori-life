import admin from 'firebase-admin';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'calori1300.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Hex decoding function to decode the stored filenames
const hexToString = (hex) => {
  try {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return hex;
  }
};

const decodeStoredName = (storedName) => {
  if (!storedName) return storedName;
  let name = storedName.replace(/^\d{10,}_/, '');
  if (/^[0-9a-f]+$/i.test(name) && name.length % 2 === 0) {
    return hexToString(name);
  }
  return name;
};

async function run() {
  const uid = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2';
  const prefix = `cl_files/${uid}/`;
  
  console.log("Fetching files from Firebase Storage...");
  const [files] = await bucket.getFiles({ prefix });
  
  // Sort by updated time desc
  files.sort((a, b) => new Date(b.metadata.updated) - new Date(a.metadata.updated));
  
  console.log("\n=== 30 Most Recently Uploaded/Updated Files in Storage ===");
  for (let i = 0; i < Math.min(30, files.length); i++) {
    const file = files[i];
    const decodedName = decodeStoredName(file.name.split('/').pop());
    console.log(`${i+1}. Path: ${file.name}`);
    console.log(`   Decoded Name: ${decodedName}`);
    console.log(`   Updated: ${file.metadata.updated}`);
    console.log(`   Size: ${file.metadata.size} bytes\n`);
  }
}

run().catch(console.error).finally(() => process.exit(0));
