import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('artifacts/absensi-siswa/dist');
const dest = path.resolve('dist');

if (fs.existsSync(src)) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('Successfully copied build output from artifacts/absensi-siswa/dist to dist');
} else {
  console.warn(`Warning: source directory "${src}" does not exist. Skipping copy.`);
}
