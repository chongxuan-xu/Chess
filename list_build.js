import fs from 'fs';
import path from 'path';

function listDirRecursive(dir, depth = 0) {
  if (depth > 2) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      const indent = '  '.repeat(depth);
      if (stat.isDirectory()) {
        console.log(`${indent}[DIR] ${file}`);
        listDirRecursive(fullPath, depth + 1);
      } else {
        console.log(`${indent}[FILE] ${file} (${stat.size} bytes)`);
      }
    }
  } catch (err) {
    console.log(`Error reading ${dir}: ${err.message}`);
  }
}

console.log("=== Checking root folders ===");
const foldersToCheck = ['.next', 'dist', 'build', 'out', 'public'];
for (const folder of foldersToCheck) {
  const fullPath = path.resolve(folder);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    console.log(`Folder "${folder}" exists! IsDirectory: ${stat.isDirectory()}`);
    if (stat.isDirectory()) {
      listDirRecursive(fullPath);
    }
  } else {
    console.log(`Folder "${folder}" does not exist.`);
  }
}
