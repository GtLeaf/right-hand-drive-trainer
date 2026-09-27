import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    localStorage.setItem('right-side-ready-progress-v2', JSON.stringify({ nz: 7, uk: 7 }));
  });
  await context.route('**/src/game.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.bridgeTest = { render, renderMiniMap, checkDriving, get game() { return game; } };` });
  });
  await context.route('**/src/render.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nexport { drawBridgeSignAssembly };` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5173/');
  await page.locator('[data-level="8"]').click();
  const results = await page.evaluate(async () => {
    const { BRIDGE: b, REGIONS } = await import('/src/data.js');
    const { steeringStep, isOnRoad } = await import('/src/rules.js');
    const { drawBridgeSignAssembly } = await import('/src/render.js');
    const game = window.bridgeTest.game;
    game.npcs = [];
    const results = [];
    for (const direction of [1, -1]) {
      game.violations = []; game.lastViolation.clear();
      const angle = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      Object.assign(game.car, { x: direction > 0 ? b.approachWest - 16 : b.approachEast + 16,
        y: b.y - direction * 25, angle, speed: 20 });
      const step = steer => {
        const previous = { ...game.car };
        steeringStep(game.car, { throttle: game.car.speed < 20, brake: false, steer }, 1 / 60);
        game.elapsed += 1 / 60;
        window.bridgeTest.checkDriving(previous, 1 / 60);
        for (const dx of [-11, 11]) for (const dy of [-19, 19]) {
          const car = game.car;
          const corner = { x: car.x + dx * Math.cos(car.angle) - dy * Math.sin(car.angle),
            y: car.y + dx * Math.sin(car.angle) + dy * Math.cos(car.angle) };
          if (!isOnRoad(corner, REGIONS.nz, true)) throw new Error(`bridge body off-road ${direction} ${JSON.stringify(corner)}`);
        }
      };
      const until = (condition, steer) => {
        for (let frame = 0; condition() && frame < 3000; frame++) step(steer);
        if (condition()) throw new Error('bridge drive timed out');
      };
      const deflection = Math.acos(1 - 25 / (2 * (85 / 1.75)));
      until(() => direction > 0 ? game.car.x < b.approachWest : game.car.x > b.approachEast, 0);
      until(() => game.car.angle < angle + deflection, 1);
      until(() => game.car.angle > angle, -1);
      until(() => direction > 0 ? game.car.x < b.to : game.car.x > b.from, 0);
      until(() => game.car.angle > angle - deflection, -1);
      until(() => game.car.angle < angle, 1);
      results.push({ direction, violations: [...game.violations] });
    }
    const c = document.createElement('canvas'); c.width = 180; c.height = 180;
    const ctx = c.getContext('2d');
    drawBridgeSignAssembly(ctx, { x: 90, y: 90, heading: 0, priority: true });
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    results.push({ yellow: pixel(90, 47), blue: pixel(90, 124), whiteArrow: pixel(83, 111), redArrow: pixel(99, 117) });
    return results;
  });
  for (const drive of results.slice(0, 2)) assert.deepEqual(drive.violations, []);
  assert.deepEqual(results[2], { yellow: [232, 182, 55, 255], blue: [18, 83, 163, 255],
    whiteArrow: [255, 249, 232, 255], redArrow: [216, 93, 72, 255] });
  const capture = async (side, name) => {
    await page.evaluate(async side => {
      const { BRIDGE: b } = await import('/src/data.js');
      const { game, render, renderMiniMap } = window.bridgeTest;
      Object.assign(game.car, { x: side === 'east' ? b.approachEast + 40 : b.approachWest - 40,
        y: b.y + (side === 'east' ? 25 : -25), angle: side === 'east' ? -Math.PI / 2 : Math.PI / 2, speed: 0 });
      const canvas = document.querySelector('#game-canvas');
      const bounds = canvas.getBoundingClientRect();
      canvas.width = bounds.width; canvas.height = bounds.height;
      render(canvas.getContext('2d'), game, bounds.width, bounds.height);
      const mini = document.querySelector('#mini-map');
      const miniBounds = mini.getBoundingClientRect();
      mini.width = miniBounds.width; mini.height = miniBounds.height;
      renderMiniMap(mini.getContext('2d'), game, miniBounds.width, miniBounds.height);
      document.querySelector('#toast').classList.remove('visible');
    }, side);
    await page.screenshot({ path: `tools/${name}.png` });
  };
  await capture('east', 'bridge-priority-redesign');
  await capture('west', 'bridge-give-redesign');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('east', 'bridge-priority-mobile');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
