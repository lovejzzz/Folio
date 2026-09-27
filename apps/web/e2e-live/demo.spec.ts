import { test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { withKey } from '../e2e/helpers';
import { routeToBridge, type Call } from './helpers';

/**
 * Records the product demo: a scripted teacher's walk through Folio against a
 * real model, as screencast frames plus a log of clicks, keys and speed marks.
 *   node scripts/deepseek-bridge.mjs 8787 &   pnpm test:live demo
 *   python3 scripts/demo/edit.py              (needs numpy, scipy, imageio-ffmpeg)
 * The cut, music and sound effects land in apps/web/live-results/demo/.
 */
const OUT = new URL('../live-results/demo/rec', import.meta.url).pathname;
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, bypassCSP: true });

/** Cursor, click ripple, captions and title cards, drawn into every page the demo visits. */
function overlay() {
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const root = document.documentElement;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 2.5v16.2l4.1-3.9 2.8 6.1 2.6-1.2-2.8-6h5.6z" fill="#1E1C17" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-80px,-80px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.28))' });
    root.appendChild(cursor);
    const w = window as unknown as Record<string, unknown>;
    const last = (w.__demoPos as [number, number]) ?? [-80, -80];
    cursor.style.transform = `translate(${last[0] - 5}px,${last[1] - 2}px)`;
    document.addEventListener('mousemove', (e) => { w.__demoPos = [e.clientX, e.clientY]; cursor.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 2}px)`; }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: `${e.clientX - 18}px`, top: `${e.clientY - 18}px`, width: '36px', height: '36px', borderRadius: '50%', border: '2px solid rgba(44,74,222,.75)', background: 'rgba(44,74,222,.12)', zIndex: '2147483646', pointerEvents: 'none', transform: 'scale(.3)', opacity: '1', transition: 'transform .45s cubic-bezier(.2,.7,.2,1), opacity .45s ease' });
      root.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.25)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    Object.assign(caption.style, { position: 'fixed', left: '28px', bottom: '28px', transform: 'translate(0, 8px)', zIndex: '2147483645', pointerEvents: 'none', background: 'rgba(30,28,23,.92)', color: '#F6F3EC', font: '500 21px/1.35 var(--font-ui, system-ui)', letterSpacing: '-0.005em', padding: '13px 26px', borderRadius: '999px', boxShadow: '0 10px 30px rgba(30,28,23,.25)', opacity: '0', transition: 'opacity .45s ease, transform .45s ease', whiteSpace: 'nowrap' });
    root.appendChild(caption);
    w.__caption = (text: string) => {
      if (!text) { caption.style.opacity = '0'; caption.style.transform = 'translate(0, 8px)'; return; }
      caption.textContent = text; caption.style.opacity = '1'; caption.style.transform = 'translate(0, 0)';
    };
    const card = document.createElement('div');
    card.id = 'demo-card';
    Object.assign(card.style, { position: 'fixed', inset: '0', zIndex: '2147483644', background: '#F2EFE7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: '0', transition: 'opacity .6s ease', pointerEvents: 'none' });
    root.appendChild(card);
    // A still card sends no frames, so something invisible keeps changing while it shows.
    const tick = document.createElement('style');
    tick.textContent = '@keyframes demo-tick { from { background: rgba(242,239,231,1) } to { background: rgba(241,238,230,1) } }';
    root.appendChild(tick);
    w.__card = (title: string, sub: string, small: string) => {
      cursor.style.opacity = title ? '0' : '1';
      cursor.style.transition = 'opacity .4s ease';
      if (!title) { card.style.opacity = '0'; return; }
      card.innerHTML = `<div style="font:400 132px/1 var(--font-display, serif);color:#1E1C17;letter-spacing:-0.02em">${title}</div><div style="margin-top:26px;font:400 30px/1.3 var(--font-reading, serif);color:#5C584F;font-style:italic">${sub}</div><div style="margin-top:44px;width:64px;height:3px;border-radius:2px;background:#2C4ADE"></div><div style="margin-top:22px;font:500 17px/1 var(--font-ui, sans-serif);color:#8A857A;letter-spacing:.08em;text-transform:uppercase">${small}</div><div style="position:fixed;left:0;top:0;width:2px;height:2px;animation:demo-tick .2s steps(2) infinite"></div>`;
      card.style.opacity = '1';
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}

class Recorder {
  frames: { file: string; t: number }[] = [];
  events: { t: number; type: string; data?: unknown }[] = [];
  private n = 0;
  private cdp!: CDPSession;
  async start(page: Page) {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    this.cdp = await page.context().newCDPSession(page);
    this.cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
      const file = `${OUT}/f${String(this.n++).padStart(6, '0')}.jpg`;
      writeFileSync(file, Buffer.from(f.data, 'base64'));
      this.frames.push({ file, t: f.metadata.timestamp });
      void this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1200, everyNthFrame: 2 });
    this.mark('start');
  }
  mark(type: string, data?: unknown) {
    this.events.push({ t: Date.now() / 1000, type, data });
  }
  async stop() {
    this.mark('end');
    await this.cdp.send('Page.stopScreencast');
    writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ frames: this.frames, events: this.events }));
  }
}

const rec = new Recorder();
let pos: [number, number] = [720, 450];
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

async function moveTo(page: Page, x: number, y: number, ms = 650) {
  const [x0, y0] = pos;
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    await page.waitForTimeout(16);
  }
  pos = [x, y];
}
async function point(page: Page, loc: Locator, ms = 650) {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  await moveTo(page, b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function click(page: Page, loc: Locator, ms = 650) {
  await point(page, loc, ms);
  await page.waitForTimeout(160);
  rec.mark('click');
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
}
async function type(page: Page, text: string, delay = 32) {
  rec.mark('speed', { factor: 1.6 });
  rec.mark('type', { n: [...text].length, delay });
  for (const ch of text) {
    rec.mark('key');
    await page.keyboard.type(ch);
    await page.waitForTimeout(delay);
  }
  rec.mark('speed', { factor: 1 });
}
/** A smooth scroll. Each wheel step is a round trip, so it runs slower than asked; the edit plays it back faster. */
async function glide(page: Page, dx: number, dy: number, ms: number, speed = 2.2) {
  rec.mark('speed', { factor: speed });
  const steps = Math.round(ms / 16);
  let doneX = 0, doneY = 0;
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    const tx = Math.round(dx * k), ty = Math.round(dy * k);
    await page.mouse.wheel(tx - doneX, ty - doneY);
    doneX = tx; doneY = ty;
    await page.waitForTimeout(16);
  }
  rec.mark('speed', { factor: 1 });
}
const caption = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __caption: (t: string) => void }).__caption(t), text);
const card = (page: Page, title: string, sub = '', small = '') => page.evaluate(([a, b, c]) => (window as unknown as { __card: (a: string, b: string, c: string) => void }).__card(a!, b!, c!), [title, sub, small]);
const hold = (page: Page, ms: number) => page.waitForTimeout(ms);
async function reveal(page: Page) {
  // After a navigation the cursor is redrawn where it was.
  await page.mouse.move(pos[0] + 1, pos[1]);
  await page.mouse.move(pos[0], pos[1]);
}

/** The brief. */
async function theBrief(page: Page) {
  await caption(page, 'Describe what you want to teach, in your own words.');
  const brief = page.getByLabel('Describe your course');
  await click(page, brief, 900);
  await type(page, 'Year 9 physics: forces and motion. Four weeks, each a 50-minute class and a 50-minute lab. A short quiz every lesson; the unit is marked by a lab report (40%) and an end-of-unit test (60%).', 24);
  await hold(page, 700);
  await caption(page, '');
  await click(page, page.getByRole('button', { name: 'Continue' }));
  rec.mark('whoosh');
}

/** The outline. */
async function theOutline(page: Page) {
  await caption(page, 'Folio drafts an outline first.');
  rec.mark('speed', { factor: 5 });
  await page.getByRole('textbox', { name: 'Title of lesson 1', exact: true }).waitFor({ timeout: 5 * 60_000 });
  await hold(page, 400);
  rec.mark('speed', { factor: 1 });
  rec.mark('pop');
  await reveal(page);
  await caption(page, 'Check it before anything is written.');
  await hold(page, 1600);
  await point(page, page.getByText('How the course is marked'), 900);
  await caption(page, 'How it’s marked, and what each lesson hands in.');
  await hold(page, 1400);
  await moveTo(page, 600, 620, 500);
  await glide(page, 0, 620, 2600);
  await hold(page, 900);
  await point(page, page.getByText('Each lesson', { exact: true }), 800);
  await caption(page, 'A class and a lab each week, each timed.');
  await hold(page, 1800);
  await caption(page, '');
  await click(page, page.getByRole('button', { name: /^Write \d+ lessons$/ }));
  rec.mark('whoosh');
}

/** Writing the course. */
async function writing(page: Page) {
  await page.getByRole('grid').waitFor();
  await reveal(page);
  await caption(page, 'Every material, for every lesson, written in a few minutes.');
  rec.mark('speed', { factor: 14 });
  await page.getByText(/Course ready/).first().waitFor({ timeout: 20 * 60_000 });
  await hold(page, 300);
  rec.mark('speed', { factor: 1 });
  rec.mark('chime');
  await hold(page, 1200);
  await caption(page, 'The overview reads like the course itself.');
  await moveTo(page, 900, 520, 700);
  await glide(page, 700, 0, 2600);
  await hold(page, 900);
  await glide(page, -700, 0, 1600);
  await hold(page, 500);
  await caption(page, '');
}

/** A lesson. */
async function aLesson(page: Page) {
  await click(page, page.getByRole('rowheader').nth(1).getByRole('link'));
  rec.mark('whoosh');
  await page.getByRole('textbox', { name: 'Title of lesson 2' }).waitFor();
  await reveal(page);
  await caption(page, 'Open a lesson: objectives, the plan for class and lab, slides, quiz.');
  await hold(page, 1400);
  await moveTo(page, 760, 600, 500);
  await glide(page, 0, 1500, 4200);
  await hold(page, 1200);
  await click(page, page.getByRole('navigation', { name: 'Jump to' }).getByRole('link', { name: 'Quiz' }));
  await hold(page, 1300);
  await caption(page, 'The right answer is ticked. The reason is one click away.');
  await click(page, page.locator('#m-quiz').getByRole('button', { name: 'Show why' }).first());
  await hold(page, 2200);
  await caption(page, '');
}

/** A change, and what it affects. */
async function aChange(page: Page) {
  await moveTo(page, 760, 400, 400);
  await glide(page, 0, -6000, 1600);
  await hold(page, 500);
  await caption(page, 'Change an objective…');
  const objective = page.getByRole('textbox', { name: 'Objective 1 of lesson 2' });
  await click(page, objective);
  await page.keyboard.press('ControlOrMeta+A');
  await type(page, 'Measure friction on three surfaces and compare the forces', 28);
  await objective.blur();
  await hold(page, 900);
  const todo = page.getByRole('button', { name: /to do/ });
  await todo.waitFor();
  rec.mark('pop');
  await caption(page, '…and Folio shows what it affects, in one card.');
  await click(page, todo);
  await hold(page, 1800);
  await click(page, page.getByRole('dialog', { name: 'To do & history' }).getByRole('button', { name: /^Update \d+$/ }));
  rec.mark('speed', { factor: 10 });
  await page.getByText('Everything is up to date.').waitFor({ timeout: 10 * 60_000 });
  await hold(page, 300);
  rec.mark('speed', { factor: 1 });
  rec.mark('chime');
  await hold(page, 1500);
  await page.keyboard.press('Escape');
  await caption(page, '');
}

/** Export. */
async function exporting(page: Page) {
  await hold(page, 400);
  await click(page, page.getByRole('button', { name: 'Export', exact: true }));
  await caption(page, 'Export for students. The answers stay with you.');
  await hold(page, 1400);
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await point(page, drawer.getByRole('radio', { name: 'You (answers)' }), 700);
  await hold(page, 1300);
  await point(page, drawer.getByRole('radio', { name: 'Students' }), 500);
  await hold(page, 900);
  await caption(page, '');
  await click(page, drawer.getByRole('button', { name: 'Download Word' }));
  rec.mark('pop');
  await hold(page, 2200);
}

test('demo', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const calls: Call[] = [];
  await withKey(page);
  await routeToBridge(page, calls);
  await page.addInitScript(overlay);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await rec.start(page);
  // The card fades in while recording: a still screen sends no frames.
  await card(page, 'Folio', 'A whole course, from one paragraph.', 'For teachers');
  await hold(page, 3400);
  rec.mark('whoosh');
  await card(page, '');
  await hold(page, 700);

  await theBrief(page);
  await theOutline(page);
  await writing(page);
  await aLesson(page);
  await aChange(page);
  await exporting(page);
  await caption(page, '');
  rec.mark('swell');
  await hold(page, 900);
  await card(page, 'Folio', 'Your course, bound together.', 'Plans · Slides · Quizzes · Rubrics · Study guides');
  await hold(page, 4200);
  await rec.stop();
});
