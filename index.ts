import { getCameraInfo } from './camera.ts';

const btn = document.getElementById('get-info')!;
const output = document.getElementById('output')!;

btn.addEventListener('click', async () => {
  output.textContent = 'Requesting camera access...';
  try {
    const info = await getCameraInfo();
    output.textContent = JSON.stringify(info, null, 2);
  } catch (err: any) {
    output.textContent = `Error: ${err.message}`;
  }
});
