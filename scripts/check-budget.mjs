// Quality budgets from the design doc (section 7.1). Fails the build if any is exceeded.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const KB = 1024;
// Total JS and dist include pdf.js (about 0.4 MB, and a 1.3 MB worker) for reading PDF syllabi. It loads only
// when a PDF is dropped in, so the first load is unchanged; the budgets make room for it and no more.
// The first load's CSS blocks the first paint: it once carried 31 KB of font rules for a face no page needed.
// The sample courses are content, fetched only when one is opened: they have their own budget, apart from the app's.
const budgets = { initialGzip: 150 * KB, initialCss: 20 * KB, totalJs: 3.5 * KB * KB, dist: 10 * KB * KB, samples: 2 * KB * KB };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(dist);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const initialGzip = initial.reduce((n, f) => n + gzipSync(readFileSync(join(dist, f))).length, 0);
const initialCss = [...html.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].reduce((n, m) => n + gzipSync(readFileSync(join(dist, m[1]))).length, 0);
const totalJs = files.filter((f) => f.endsWith('.js')).reduce((n, f) => n + statSync(f).size, 0);
const isSample = (f) => f.startsWith(join(dist, 'samples/'));
const distSize = files.filter((f) => !isSample(f)).reduce((n, f) => n + statSync(f).size, 0);
const samplesSize = files.filter(isSample).reduce((n, f) => n + statSync(f).size, 0);

const rows = [
  ['Initial JS (gzip)', initialGzip, budgets.initialGzip],
  ['Initial CSS (gzip)', initialCss, budgets.initialCss],
  ['Total JS', totalJs, budgets.totalJs],
  ['dist', distSize, budgets.dist],
  ['Sample courses', samplesSize, budgets.samples],
];
let failed = false;
for (const [name, value, limit] of rows) {
  const ok = value <= limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(18)} ${(value / KB).toFixed(1).padStart(8)} KB  (budget ${(limit / KB).toFixed(0)} KB)`);
}
console.log(`     initial files: ${initial.join(', ')}`);
process.exit(failed ? 1 : 0);
