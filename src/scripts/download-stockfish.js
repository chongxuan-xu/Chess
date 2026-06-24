import fs from 'fs';
import path from 'path';

async function download(url, filePath) {
  console.log(`Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`Saved to ${filePath}`);
}

async function main() {
  const stockfishDir = path.join(process.cwd(), 'public', 'stockfish');
  
  // Clean first
  if (fs.existsSync(stockfishDir)) {
    fs.rmSync(stockfishDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stockfishDir, { recursive: true });

  // Download official Stockfish 18.0.8 lite single-threaded JS and WASM
  await download('https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js', path.join(stockfishDir, 'stockfish-18-lite-single.js'));
  await download('https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm', path.join(stockfishDir, 'stockfish-18-lite-single.wasm'));
  
  console.log('Stockfish 18.0.8 downloaded successfully!');
}

main().catch(console.error);
