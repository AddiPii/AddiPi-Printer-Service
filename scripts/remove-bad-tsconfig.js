import { fs } from 'fs';
import { path } from 'path';

const target = path.join(__dirname, '..', 'node_modules', 'azure-iot-common', 'tsconfig.json');
try {
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log('Removed problematic file:', target);
  }
} catch (e) {
  // ignore
}
