import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://localhost:5173/');
  assert.equal(await page.locator('#level-list .level-card').count(), 7);
  assert.equal(await page.locator('#play').isVisible(), false);
  assert.equal(await page.locator('[data-level="7"]').isDisabled(), true);

  await page.locator('[data-level="1"]').click();
  assert.equal(await page.locator('#play').isVisible(), true);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  assert.ok(Number(await page.locator('#speed').innerText()) > 0);
  await page.screenshot({ path: 'tools/desktop-preview.png' });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3600);
  await page.keyboard.up('ArrowUp');
  assert.equal(await page.locator('#dialog-title').innerText(), '安全抵达');
  await page.locator('#dialog-secondary').click();
  assert.equal(await page.locator('[data-level="2"]').isDisabled(), false);
  await page.locator('[data-level="2"]').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2450);
  await page.keyboard.up('ArrowUp');
  assert.equal(await page.locator('#dialog-title').innerText(), '这次先停一下');
  assert.match(await page.locator('#dialog-body').innerText(), /STOP/);
  await page.locator('#dialog-secondary').click();
  await page.locator('[data-region="uk"]').click();
  assert.match(await page.locator('#region-caption').innerText(), /UNITED KINGDOM/);
  await page.locator('[data-region="nz"]').click();
  await page.evaluate(() => localStorage.setItem('right-side-ready-progress-v1', JSON.stringify({ nz: 6, uk: 0 })));
  await page.reload();
  assert.equal(await page.locator('[data-level="7"]').isDisabled(), false);
  await page.locator('[data-level="3"]').click();
  assert.equal(await page.locator('#play-name').innerText(), 'T 型右转');
  assert.match(await page.locator('#mission-text').innerText(), /东侧 T 字口让行后右转/);
  await page.screenshot({ path: 'tools/t-junction-preview.png' });
  await page.locator('#back-button').click();
  await page.locator('[data-level="4"]').click();
  await page.waitForFunction(() => document.querySelector('#status-banner').textContent.includes('北向信号'));
  await page.screenshot({ path: 'tools/signal-preview.png' });
  await page.locator('#back-button').click();
  await page.locator('[data-level="7"]').click();
  assert.equal(await page.locator('#mini-map').isVisible(), true);
  await page.screenshot({ path: 'tools/free-preview.png' });
  await page.evaluate(() => {
    const context = document.querySelector('#game-canvas').getContext('2d');
    const clearRect = context.clearRect;
    const roundRect = context.roundRect;
    context.clearRect = function (...args) {
      this.carDraws = 0;
      return clearRect.apply(this, args);
    };
    context.roundRect = function (...args) {
      this.carDraws += 1;
      return roundRect.apply(this, args);
    };
  });
  const drawnCars = () => page.evaluate(() => document.querySelector('#game-canvas').getContext('2d').carDraws);
  await page.waitForTimeout(80);
  assert.equal(await drawnCars(), 5);
  await page.locator('#density-button').click();
  assert.equal(await page.locator('#density-button').innerText(), '车流：低（重开生效）');
  await page.waitForTimeout(80);
  assert.equal(await drawnCars(), 5);
  await page.locator('#density-button').click();
  assert.equal(await page.locator('#density-button').innerText(), '车流：标准（重开生效）');
  await page.waitForTimeout(80);
  assert.equal(await drawnCars(), 5);
  await page.locator('#density-button').click();
  await page.locator('#restart-button').click();
  assert.equal(await page.locator('#density-button').innerText(), '车流：低');
  await page.waitForTimeout(80);
  assert.equal(await drawnCars(), 3);
  await page.locator('#density-button').click();
  await page.locator('#restart-button').click();
  assert.equal(await page.locator('#density-button').innerText(), '车流：标准');
  await page.waitForTimeout(80);
  assert.equal(await drawnCars(), 5);
  await page.locator('#mini-toggle').click();
  assert.equal(await page.locator('#mini-map').isVisible(), false);
  await page.locator('#mini-toggle').click();

  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1600);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');
  assert.equal(await page.locator('#game-dialog').isVisible(), false);
  await page.locator('#review-button').click();
  const review = await page.locator('#dialog-title').innerText();
  assert.match(review, /[1-9]\d* 条提示/);
  await page.locator('#dialog-primary').click();
  await page.locator('#restart-button').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(4900);
  await page.keyboard.up('ArrowUp');
  assert.equal(await page.locator('#game-dialog').isVisible(), false);
  await page.locator('#review-button').click();
  assert.match(await page.locator('#dialog-body').innerText(), /STOP/);
  await page.locator('#dialog-primary').click();
  await page.locator('#back-button').click();
  await page.waitForFunction(() => document.querySelector('#offline-status').textContent.includes('已就绪'));
  await desktop.setOffline(true);
  await page.reload();
  assert.equal(await page.locator('#level-list .level-card').count(), 7);
  await page.locator('[data-level="7"]').click();
  assert.equal(await page.locator('#play').isVisible(), true);
  await page.locator('#back-button').click();
  await page.locator('[data-region="uk"]').click();
  await page.locator('[data-level="1"]').click();
  assert.equal(await page.locator('#play').isVisible(), true);
  assert.match(await page.locator('#play-index').innerText(), /UK/);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', error => errors.push(error.message));
  mobilePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await mobilePage.goto('http://localhost:5173/');
  await mobilePage.locator('[data-level="1"]').click();
  const touchBehavior = await mobilePage.evaluate(() => {
    const label = document.querySelector('.control-label');
    const brake = document.querySelector('#brake');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    brake.dispatchEvent(event);
    return { selection: getComputedStyle(label).userSelect, contextPrevented: event.defaultPrevented };
  });
  assert.deepEqual(touchBehavior, { selection: 'none', contextPrevented: true });
  await mobilePage.locator('#signal-left').click();
  assert.equal(await mobilePage.locator('#signal-left').getAttribute('aria-pressed'), 'true');
  await mobilePage.locator('#signal-right').click();
  assert.equal(await mobilePage.locator('#signal-left').getAttribute('aria-pressed'), 'false');
  assert.equal(await mobilePage.locator('#signal-right').getAttribute('aria-pressed'), 'true');
  const lampColors = await mobilePage.evaluate(async () => {
    const [{ render }, { REGIONS }] = await Promise.all([import('./src/render.js'), import('./src/data.js')]);
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const context = canvas.getContext('2d');
    const pixel = (pixelX, pixelY) => [...context.getImageData(pixelX, pixelY, 1, 1).data];
    const sample = (signal, brake, elapsed) => {
      render(context, { car: { x: 185, y: 650, angle: 0, signal }, region: REGIONS.nz,
        elapsed, level: { id: 7 }, input: { brake }, npcs: [] }, 600, 600);
      return { leftFront: pixel(287, 350), rightFront: pixel(312, 350),
        leftRear: pixel(287, 391), rightRear: pixel(312, 391),
        leftBrake: pixel(294, 393), rightBrake: pixel(305, 393) };
    };
    return { off: sample(null, false, 0), left: sample('left', false, 0),
      right: sample('right', false, 0), blinkOff: sample('left', false, .4),
      brake: sample(null, true, 0), both: sample('left', true, 0) };
  });
  assert.ok(lampColors.left.leftFront[0] > 240 && lampColors.left.leftRear[0] > 240);
  assert.ok(lampColors.right.rightFront[0] > 240 && lampColors.right.rightRear[0] > 240);
  assert.ok(lampColors.left.rightFront[0] < 150 && lampColors.right.leftFront[0] < 150);
  assert.ok(lampColors.blinkOff.leftFront[0] < 150);
  assert.ok(lampColors.brake.leftBrake[0] > lampColors.off.leftBrake[0] + 90);
  assert.ok(lampColors.brake.rightBrake[0] > lampColors.off.rightBrake[0] + 90);
  assert.ok(lampColors.both.leftFront[0] > 240 && lampColors.both.leftBrake[0] > 240);
  const rearLightRed = () => mobilePage.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    const bounds = canvas.getBoundingClientRect();
    const ratio = canvas.width / bounds.width;
    const scale = Math.max(.6, Math.min(1.25, bounds.height / 370));
    const pixelX = Math.round((bounds.width / 2 - 5 * scale) * ratio);
    const pixelY = Math.round((bounds.height * .62 + 17 * scale) * ratio);
    return canvas.getContext('2d').getImageData(pixelX, pixelY, 1, 1).data[0];
  });
  const brakeOffRed = await rearLightRed();
  const brake = mobilePage.locator('#brake');
  const brakeBounds = await brake.boundingBox();
  assert.ok(brakeBounds);
  await mobilePage.mouse.move(brakeBounds.x + brakeBounds.width / 2, brakeBounds.y + brakeBounds.height / 2);
  await mobilePage.mouse.down();
  assert.match(await brake.getAttribute('class'), /pressed/);
  await mobilePage.waitForTimeout(80);
  assert.ok(await rearLightRed() > brakeOffRed + 90);
  await mobilePage.mouse.up();
  const throttle = mobilePage.locator('#throttle');
  const box = await throttle.boundingBox();
  assert.ok(box && box.width >= 50 && box.height >= 60);
  await mobilePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await mobilePage.mouse.down();
  await mobilePage.waitForTimeout(650);
  await mobilePage.mouse.up();
  assert.ok(Number(await mobilePage.locator('#speed').innerText()) > 0);
  await mobilePage.screenshot({ path: 'tools/mobile-preview.png' });
  assert.equal(await mobilePage.locator('#game-canvas').isVisible(), true);
  await mobile.close();

  const portrait = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const portraitPage = await portrait.newPage();
  portraitPage.on('pageerror', error => errors.push(error.message));
  portraitPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await portraitPage.goto('http://localhost:5173/');
  await portraitPage.screenshot({ path: 'tools/home-preview.png' });
  await portraitPage.locator('[data-level="1"]').click();
  const controlBounds = await portraitPage.locator('#drive-controls').boundingBox();
  const throttleBounds = await portraitPage.locator('#throttle').boundingBox();
  assert.ok(controlBounds && throttleBounds && throttleBounds.x + throttleBounds.width <= controlBounds.x + controlBounds.width);
  await portraitPage.screenshot({ path: 'tools/portrait-preview.png' });
  await portrait.close();

  assert.deepEqual(errors, []);
  console.log('通过：首关、STOP、路口灯号、车流切换不闪现、手机触控/车灯、自由关、离线切英国及横竖屏；无页面异常。');
} finally {
  await browser.close();
}
