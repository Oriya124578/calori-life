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
  const [files] = await bucket.getFiles({ prefix: `cl_files/${uid}` });
  
  console.log(`Auditing ${files.length} files in Firebase Storage under cl_files/${uid}:`);
  
  let validPdfCount = 0;
  let invalidPdfCount = 0;
  
  for (const file of files) {
    const isPdfExtension = file.name.toLowerCase().endsWith('.pdf') || 
                           // Decoded name check
                           file.name.includes('pdf'); // hex name contains pdf
    
    // Read the first 4 bytes
    try {
      const [buffer] = await file.download({ start: 0, end: 3 });
      const magic = buffer.toString('ascii');
      const isPdfHeader = magic === '%PDF';
      
      console.log(`- File: "${file.name}"`);
      console.log(`  Header Magic: "${magic}" (Valid PDF Header: ${isPdfHeader})`);
      
      if (isPdfHeader) {
        validPdfCount++;
      } else {
        invalidPdfCount++;
      }
    } catch (err) {
      console.log(`- File: "${file.name}"`);
      console.error(`  Failed to read: ${err.message}`);
      invalidPdfCount++;
    }
  }
  
  console.log(`\nAudit Summary:`);
  console.log(`- Total files audited: ${files.length}`);
  console.log(`- Valid PDF files (starting with %PDF): ${validPdfCount}`);
  console.log(`- Invalid or unreadable files: ${invalidPdfCount}`);
}

run().catch(console.error).finally(() => process.exit(0));
