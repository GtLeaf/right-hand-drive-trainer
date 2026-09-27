import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    localStorage.setItem('right-side-ready-progress-v2', JSON.stringify({ nz: 7, uk: 7 }));
  });
  await context.route('**/src/render.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nexport { drawGround, drawStopAndGiveWay, drawLights, drawCrossing, drawCar };` });
  });
  await context.route('**/src/game.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.mapTest = { render, renderMiniMap, get game() { return game; } };` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5173/');
  const summary = await page.evaluate(async () => {
    const { WORLD, LAYOUT: L, COMPLEX_T: t, REGIONS } = await import('/src/data.js');
    const { drawGround, drawStopAndGiveWay, drawLights, drawCrossing, drawCar, renderMiniMap } = await import('/src/render.js');
    const { createNpcs } = await import('/src/npc.js');
    const canvas = document.createElement('canvas');
    canvas.width = WORLD.width; canvas.height = WORLD.height;
    const ctx = canvas.getContext('2d');
    drawGround(ctx, REGIONS.nz, true);
    drawCrossing(ctx);
    drawStopAndGiveWay(ctx, REGIONS.nz, true);
    drawLights(ctx, 0, REGIONS.nz);
    const npcs = createNpcs(8, 'normal', REGIONS.nz);
    for (const npc of npcs) drawCar(ctx, npc, npc.color, 0);
    ctx.fillStyle = '#173d34';
    ctx.textAlign = 'left';
    ctx.font = '600 24px "PingFang SC", sans-serif';
    ctx.fillText('自由练习小镇 · 1600 × 1200', 80, 54);
    ctx.font = '500 18px "PingFang SC", sans-serif';
    for (const [text, x, y] of [['基础练习街区', 300, 380], ['环岛', L.center - 170, L.middle - 150],
      ['复杂 T 字路口', t.x - 60, t.y + 120], ['窄桥', 380, L.south - 105], ['东侧连接道路', L.east - 195, 820]]) {
      ctx.fillText(text, x, y);
    }
    const mini = document.createElement('canvas');
    mini.width = 320; mini.height = 240;
    const m = mini.getContext('2d');
    renderMiniMap(m, { level: { free: true }, region: REGIONS.nz, car: { x: 195, y: 660 } }, 320, 240);
    const eastRoad = [...m.getImageData(L.east * .2, 800 * .2, 1, 1).data];
    document.body.replaceChildren(canvas);
    document.body.style.cssText = 'margin:0;background:#6f956c';
    canvas.style.cssText = 'display:block;width:1600px;height:1200px';
    return { width: WORLD.width, height: WORLD.height, ringToJunction: t.x - L.center,
      laneSelectionLength: t.giveWayY - t.branchFullFrom, eastRoad, npcs: npcs.length };
  });
  assert.deepEqual(summary.eastRoad, [169, 184, 168, 255]);
  await page.screenshot({ path: 'tools/expanded-map-overview.png' });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.locator('[data-level="8"]').click();
    await page.evaluate(async () => {
      const { COMPLEX_T: t } = await import('/src/data.js');
      const { game, render, renderMiniMap } = window.mapTest;
      Object.assign(game.car, { x: t.branchRightLane, y: t.giveWayY - 22, angle: Math.PI });
      const canvas = document.querySelector('#game-canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width; canvas.height = rect.height;
      render(canvas.getContext('2d'), game, rect.width, rect.height);
      const mini = document.querySelector('#mini-map');
      const mr = mini.getBoundingClientRect();
      mini.width = mr.width; mini.height = mr.height;
      renderMiniMap(mini.getContext('2d'), game, mr.width, mr.height);
    });
    assert.equal(await page.locator('#mini-map').isVisible(), true);
    const throttle = await page.locator('#throttle').boundingBox();
    assert.ok(throttle && throttle.x >= 0 && throttle.x + throttle.width <= viewport.width);
    await page.screenshot({ path: `tools/expanded-map-${viewport.width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(summary);
} finally {
  await browser.close();
}
