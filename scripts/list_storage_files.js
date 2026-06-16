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
  console.log(`Listing files in Firebase Storage under prefix: ${prefix}`);
  const [files] = await bucket.getFiles({ prefix });
  files.forEach(file => {
    console.log(`- ${file.name} (size: ${file.metadata.size} bytes)`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
