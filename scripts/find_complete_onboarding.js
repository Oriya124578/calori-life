import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const storePath = 'c:\\src\\projects\\calori_1300\\apps\\calori_life\\src\\store\\useStore.js';
const content = fs.readFileSync(storePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('updateCourse') || line.includes('deleteCourse')) {
    console.log(`Line ${index + 1}: ${line}`);
  }
});
