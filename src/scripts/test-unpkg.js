import fetch from 'node-fetch';

async function main() {
  try {
    const res = await fetch('https://unpkg.com/stockfish@18.0.8/?meta');
    const json = await res.json();
    console.log('Stockfish files:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error fetching meta:', err);
  }
}

main();
