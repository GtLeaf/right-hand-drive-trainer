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
    await route.fulfill({ response, body: `${await response.text()}\nwindow.trafficTest = { startLevel, checkDriving, update, render, renderMiniMap, get game() { return game; } };` });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5173/');
  const checks = await page.evaluate(async () => {
    const { CONTROL_POINTS, CROSSING, JUNCTIONS, REGIONS, SIGNAL_APPROACHES, WORLD } = await import('/src/data.js');
    const { npcRoutes, sampleRoute } = await import('/src/npc.js');
    const { roundaboutIndicator, isOnRoad } = await import('/src/rules.js');
    const driver = window.trafficTest, checks = [];
    const setup = (car, elapsed = 4) => {
      driver.startLevel(8);
      const game = driver.game;
      game.npcs = []; game.pedestrians = []; game.elapsed = elapsed;
      Object.assign(game.car, { speed: 20, signal: null, observedSignal: null, signalSince: elapsed - 4 }, car);
      game.car.observedSignal = game.car.signal;
      return game;
    };
    const step = (game, point, dt = 1 / 60) => {
      const previous = { ...game.car };
      Object.assign(game.car, point); game.elapsed += dt;
      driver.checkDriving(previous, dt);
    };
    const expect = (name, game, code, present) => {
      if (game.violations.some(event => event.code === code) !== present) throw new Error(`${name}: ${JSON.stringify(game.violations)}`);
      checks.push(name);
    };
    const stop = CONTROL_POINTS.find(item => item.id === 'stop-t');
    let game = setup({ x: stop.x, y: stop.y + 22, angle: 0, speed: 1 });
    for (let i = 0; i < 60; i++) step(game, {});
    step(game, { y: stop.y + 18 });
    expect('玩家滑行过 STOP 被记录', game, 'stop', true);
    game = setup({ x: stop.x, y: stop.y + 22, angle: 0, speed: 0 });
    for (let i = 0; i < 20; i++) step(game, {});
    step(game, { y: stop.y + 18, speed: 10 });
    expect('玩家在线前停稳后可通过', game, 'stop', false);
    for (const approach of SIGNAL_APPROACHES) {
      const car = { x: approach.axis === 'x' ? approach.position - approach.direction * 20 : (approach.laneMin + approach.laneMax) / 2,
        y: approach.axis === 'y' ? approach.position - approach.direction * 20 : (approach.laneMin + approach.laneMax) / 2,
        angle: approach.heading, signal: 'right' };
      game = setup(car, approach.axis === 'y' ? 1 : 13);
      step(game, { [approach.axis]: car[approach.axis] + approach.direction * 2 });
      expect(`${approach.id} 圆绿加红箭头禁止右转`, game, 'red-light', true);
      game = setup(car, approach.axis === 'y' ? 24 : 31);
      step(game, { [approach.axis]: car[approach.axis] + approach.direction * 2 });
      expect(`${approach.id} 专用绿箭头放行右转`, game, 'red-light', false);
    }
    // 四个方向实际转向时都检查对向车，不依赖世界坐标的南北方向。
    const junction = JUNCTIONS.find(item => item.id === 'signal');
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const start = { x: junction.x - Math.sin(angle) * 110, y: junction.y + Math.cos(angle) * 110, angle, signal: 'right' };
      game = setup(start, Math.abs(Math.sin(angle)) < .5 ? 4 : 16);
      step(game, {});
      game.npcs = [{ x: junction.x + Math.sin(angle) * 95, y: junction.y - Math.cos(angle) * 95, angle: angle + Math.PI, speed: 35, signal: null }];
      step(game, { x: junction.x - Math.sin(angle) * 40, y: junction.y + Math.cos(angle) * 40, angle: angle + .6 });
      expect(`右转让对向车 ${angle}`, game, 'oncoming', true);
    }
    game = setup({ x: 575, y: 310, angle: 0, signal: 'right' });
    step(game, {});
    step(game, { x: 600, y: 175, angle: 1 });
    step(game, { x: 685, y: 215, angle: Math.PI / 2 });
    expect('转弯后进入对向车道被记录', game, 'turn-lane', true);
    game = setup({ x: 245, y: 820, angle: 0, speed: 2 });
    for (let i = 0; i < 35; i++) step(game, { y: game.car.y - .03 });
    expect('低速逆行仍被记录', game, 'wrong-side', true);
    game = setup({ x: CROSSING.x - 28, y: CROSSING.y - 25, angle: Math.PI / 2 });
    game.pedestrians = [{ x: CROSSING.x + 17, y: CROSSING.y - 59, state: 'waiting' }];
    step(game, { x: CROSSING.x - 26 });
    expect('斑马线等待行人获让行', game, 'pedestrian-yield', true);
    game = setup({ x: CROSSING.x - 28, y: CROSSING.y - 25, angle: Math.PI / 2 });
    step(game, { x: CROSSING.x - 26 });
    expect('空斑马线可正常通过', game, 'pedestrian-yield', false);
    for (const route of npcRoutes(REGIONS.nz).slice(0, 3)) {
      const plan = route.roundabout;
      const start = plan.entry - 100;
      const first = sampleRoute(route, start);
      game = setup({ ...first, signal: roundaboutIndicator(plan.entryArm, plan.exitArm, first, false) }, 40);
      for (let at = start + 1; at <= plan.exit + 95; at++) {
        const point = sampleRoute(route, at);
        const signal = roundaboutIndicator(plan.entryArm, plan.exitArm, point, at >= plan.entry);
        step(game, { ...point, signal, speed: 20 }, .05);
        if (!isOnRoad(point, REGIONS.nz)) throw new Error('环岛路线驶出路面');
      }
      if (game.violations.length) throw new Error(`环岛 ${route.id}: ${JSON.stringify(game.violations)}`);
      checks.push(`环岛 ${route.id} 正确示意通过`);
    }
    return checks;
  });
  const capture = async (name, scene) => {
    await page.evaluate(async scene => {
      const { createPedestrians } = await import('/src/rules.js');
      const { startLevel, render, renderMiniMap } = window.trafficTest;
      startLevel(8);
      const game = window.trafficTest.game;
      game.npcs = []; game.elapsed = scene === 'crossing' ? 10 : 24;
      Object.assign(game.car, scene === 'crossing' ? { x: 303, y: 165, angle: Math.PI / 2 } : { x: 575, y: 288, angle: 0, signal: 'right' });
      game.pedestrians = createPedestrians();
      if (scene === 'crossing') Object.assign(game.pedestrians[0], { state: 'crossing', y: 174 });
      for (const [selector, renderer] of [['#game-canvas', render], ['#mini-map', renderMiniMap]]) {
        const canvas = document.querySelector(selector), bounds = canvas.getBoundingClientRect();
        canvas.width = bounds.width; canvas.height = bounds.height;
        renderer(canvas.getContext('2d'), game, bounds.width, bounds.height);
      }
    }, scene);
    await page.screenshot({ path: `tools/${name}.png` });
  };
  await capture('traffic-crossing-desktop', 'crossing');
  await capture('traffic-arrow-desktop', 'signal');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('traffic-crossing-mobile', 'crossing');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(checks, null, 2));
} finally { await browser.close(); }
