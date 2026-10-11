// Renders a reel timeline to video frames with headless Chromium.
// Usage:
//   node render.cjs <timeline.json> <out.mp4> [--fps 30]
//   node render.cjs <timeline.json> <outdir> --stills 0.5,2,7.3   (PNG previews)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const [specPath, out, ...rest] = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
  const fps = Number(opt.fps || 30);
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'reel.html'));
  await page.evaluate(() => Promise.all([...document.fonts].map(f => f.load())));
  await page.evaluate(s => window.setup(s), spec);
  await page.evaluate(() => document.fonts.ready);
  const stage = await page.$('#stage');

  if (opt.stills) {
    fs.mkdirSync(out, { recursive: true });
    for (const t of opt.stills.split(',').map(Number)) {
      await page.evaluate(x => window.seek(x), t);
      await stage.screenshot({ path: path.join(out, `t${t.toFixed(2)}.png`) });
    }
    await browser.close();
    return;
  }

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(spec.total * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(x => window.seek(x), f / fps);
    const buf = await stage.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stderr.write(`\r${path.basename(out)} frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  process.stderr.write(`\r${path.basename(out)} done (${frames} frames)\n`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
