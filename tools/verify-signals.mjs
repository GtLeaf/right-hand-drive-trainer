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
    await route.fulfill({ response, body: `${await response.text()}\nwindow.signalTest = { startLevel, render, renderMiniMap, get game() { return game; } };` });
  });
  await context.route('**/src/render.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.drawSignalTest = drawLights;` });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://localhost:5173/');
  const checks = await page.evaluate(async () => {
    const { SIGNAL_APPROACHES, SIGNAL_HEADS, REGIONS } = await import('/src/data.js');
    const { signalForApproach, rightArrowState, signalMustStop, signalApproachForCar } = await import('/src/rules.js');
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1200;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const colors = { red: '240,117,91', amber: '246,195,91', green: '124,206,132' };
    const active = new Set(Object.values(colors));
    const pixel = (head, approach, x, y) => {
      const px = head.x + x * Math.cos(approach.heading) - y * Math.sin(approach.heading);
      const py = head.y + x * Math.sin(approach.heading) + y * Math.cos(approach.heading);
      return [...ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data].slice(0, 3).join(',');
    };
    const expect = (condition, name) => { if (!condition) throw new Error(name); };
    const checks = [];
    for (const region of Object.values(REGIONS)) {
      for (const approach of SIGNAL_APPROACHES) {
        const viewer = { x: approach.axis === 'x' ? approach.position - approach.direction * 55 : (approach.laneMin + approach.laneMax) / 2,
          y: approach.axis === 'y' ? approach.position - approach.direction * 55 : (approach.laneMin + approach.laneMax) / 2,
          angle: approach.heading, speed: 0 };
        expect(signalApproachForCar(viewer)?.id === approach.id, '驾驶方向与判定进口一致');
        const heads = SIGNAL_HEADS.filter(head => head.approachId === approach.id);
        const repeater = heads.find(head => head.kind === 'repeater');
        expect(Math.abs(repeater[approach.laneAxis] - viewer[approach.laneAxis]) < 2, '对面灯对齐本车道');
        expect((repeater[approach.axis] - approach.position) * approach.direction > 100, '重复灯在路口对面');
        for (let time = 0; time < (region.code === 'NZ' ? 37 : 23); time += .5) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          window.drawSignalTest(ctx, time, region, viewer);
          const circleState = signalForApproach(time, region, approach);
          const arrowState = rightArrowState(time, region, approach);
          for (const head of SIGNAL_HEADS) {
            const owner = SIGNAL_APPROACHES.find(item => item.id === head.approachId);
            for (const [index, color] of ['red', 'amber', 'green'].entries()) {
              const circleLit = active.has(pixel(head, owner, region.code === 'NZ' ? -10 : 0, index * 14 - 14));
              const own = head.approachId === approach.id;
              const wanted = own && (circleState === color || circleState === 'redAmber' && color !== 'green');
              expect(circleLit === wanted, `${region.code}/${approach.id}/${time}/${head.approachId}/${head.kind}: 圆灯 ${color}`);
              if (region.code === 'NZ') {
                const arrowLit = active.has(pixel(head, owner, 9, index * 14 - 14));
                expect(arrowLit === (own && arrowState === color), `${approach.id}/${time}/${head.kind}: 箭头 ${color}`);
              }
            }
          }
          for (const turn of ['straight', 'right']) {
            const movement = turn === 'right' && arrowState !== 'off' ? arrowState : circleState;
            expect(signalMustStop(viewer, approach, time, region, turn, {}) === (movement !== 'green'), '静止车辆判定与显示灯色一致');
          }
        }
        // 在线前停稳时，近端灯可能已在身后，但远端灯必须继续亮给本车看。
        viewer[approach.axis] = approach.position - approach.direction * 20;
        const greenTime = approach.axis === 'y' ? 4 : 16;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.drawSignalTest(ctx, greenTime, region, viewer);
        expect(pixel(repeater, approach, region.code === 'NZ' ? -10 : 0, 14) === colors.green, '停止线前能看清远端绿灯');
        viewer[approach.axis] = repeater[approach.axis] + approach.direction * 30;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.drawSignalTest(ctx, greenTime, region, viewer);
        for (const head of heads) expect(!active.has(pixel(head, approach, region.code === 'NZ' ? -10 : 0, 14)), '驶过灯杆后不从背面看见绿灯');
        checks.push(`${region.code} ${approach.id}: 全周期灯色、重复灯同步、其他进口遮蔽、停车及驶出视角`);
      }
    }
    return checks;
  });
  for (const [region, direction, width, height] of [
    ['nz', 'northbound', 1280, 800], ['nz', 'southbound', 1280, 800],
    ['nz', 'eastbound', 1280, 800], ['nz', 'westbound', 1280, 800],
    ['nz', 'northbound', 390, 844], ['nz', 'eastbound', 390, 844],
    ['uk', 'northbound', 1280, 800]
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(`[data-region="${region}"]`).click();
    await page.evaluate(async ({ region, direction }) => {
      const { SIGNAL_APPROACHES, REGIONS } = await import('/src/data.js');
      const { startLevel, render, renderMiniMap } = window.signalTest;
      startLevel(8);
      const game = window.signalTest.game, approach = SIGNAL_APPROACHES.find(item => item.id === direction);
      game.region = REGIONS[region]; game.npcs = []; game.pedestrians = [];
      game.elapsed = approach.axis === 'y' ? 24 : 31;
      Object.assign(game.car, { x: approach.axis === 'x' ? approach.position - approach.direction * 52 : (approach.laneMin + approach.laneMax) / 2,
        y: approach.axis === 'y' ? approach.position - approach.direction * 52 : (approach.laneMin + approach.laneMax) / 2,
        angle: approach.heading, signal: 'right' });
      for (const [selector, renderer] of [['#game-canvas', render], ['#mini-map', renderMiniMap]]) {
        const canvas = document.querySelector(selector), bounds = canvas.getBoundingClientRect();
        canvas.width = bounds.width; canvas.height = bounds.height;
        renderer(canvas.getContext('2d'), game, bounds.width, bounds.height);
      }
    }, { region, direction });
    await page.screenshot({ path: `tools/signals-${region}-${direction}-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(checks, null, 2));
} finally { await browser.close(); }
