import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// 仅在测试页面中暴露驱动入口，不给正式游戏增加调试接口。
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    localStorage.setItem('right-side-ready-progress-v2', JSON.stringify({ nz: 7, uk: 7 }));
  });
  await context.route('**/src/game.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.junctionTest = { startLevel, checkDriving, render, get game() { return game; } };` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5173/');
  const results = await page.evaluate(async () => {
    const { COMPLEX_T: t, REGIONS } = await import('/src/data.js');
    const { npcRoutes, sampleRoute } = await import('/src/npc.js');
    const { isOnRoad, inComplexMedian, steeringStep } = await import('/src/rules.js');
    const driver = window.junctionTest;
    const run = (name, points, signal, wait = false) => {
      driver.startLevel(8);
      const game = driver.game;
      game.npcs = [];
      Object.assign(game.car, points[0], { signal, speed: 20 });
      let waited = false;
      for (const point of points.slice(1)) {
        const previous = { ...game.car };
        Object.assign(game.car, point, { signal, speed: 20 });
        game.elapsed += .1;
        driver.checkDriving(previous, .1);
        if (!isOnRoad(point, REGIONS.nz, true)) throw new Error(`${name}: off-road ${JSON.stringify(point)}`);
        if (wait && !waited && Math.hypot(point.x - t.medianWaitX, point.y - t.y) < 4) {
          if (!inComplexMedian(point)) throw new Error('waiting outside median');
          for (let frame = 0; frame < 5; frame++) {
            game.car.speed = 0;
            game.elapsed += .1;
            driver.checkDriving({ ...game.car }, .1);
          }
          waited = true;
        }
      }
      return { name, waited, stage: game.complexStage, violations: game.violations };
    };
    const route = npcRoutes(REGIONS.nz, true)[0];
    const give = route.markers.find(marker => marker.name === 'complex-give');
    const median = route.markers.find(marker => marker.name === 'complex-median');
    const right = [];
    for (let progress = give.at - 12; progress < median.at + 165; progress += 1) right.push(sampleRoute(route, progress));
    const skippedWait = run('未停车直接驶出中央区', right, 'right');
    if (!skippedWait.violations.some(event => event.code === 'complex-no-wait')) throw new Error('missing median wait violation');
    const curve = (start, control, end) => Array.from({ length: 151 }, (_, i) => {
      const u = i / 150, v = 1 - u;
      return { x: v * v * start.x + 2 * v * u * control.x + u * u * end.x,
        y: v * v * start.y + 2 * v * u * control.y + u * u * end.y,
        angle: Math.atan2(v * (control.x - start.x) + u * (end.x - control.x),
          -v * (control.y - start.y) - u * (end.y - control.y)) };
    });
    const left = curve({ x: t.branchLeftLane, y: t.giveWayY - 26 }, { x: t.branchLeftLane, y: t.eastboundLane },
      { x: t.x + 140, y: t.eastboundLane });
    const intoBranch = curve({ x: t.x + 120, y: t.y }, { x: t.branchExitLane, y: t.y },
      { x: t.branchExitLane, y: t.giveWayY - 34 });
    const results = [run('支路右转并在中央等待', right, 'right', true),
      run('支路左转', left, 'left'), run('主路右转驶入支路', intoBranch, 'right')];
    // 使用正式车辆运动模型逐帧转向，检查最小转弯半径确实能完成两段右转。
    driver.startLevel(8);
    const physical = driver.game;
    physical.npcs = [];
    Object.assign(physical.car, { x: t.branchRightLane, y: t.giveWayY - 44, angle: Math.PI, speed: 20, signal: 'right' });
    const step = (steer = 0, brake = false) => {
      const previous = { ...physical.car };
      steeringStep(physical.car, { throttle: !brake && physical.car.speed < 20, brake, steer }, 1 / 60);
      physical.elapsed += 1 / 60;
      driver.checkDriving(previous, 1 / 60);
      if (!isOnRoad(physical.car, REGIONS.nz, true)) throw new Error('vehicle physics left road');
    };
    const until = (condition, steer = 0) => {
      for (let frame = 0; condition() && frame < 3000; frame++) step(steer);
      if (condition()) throw new Error('vehicle physics timed out');
    };
    until(() => physical.car.y < t.y - 50);
    until(() => physical.car.angle < Math.PI * 1.5, 1);
    for (let i = 0; i < 60; i++) step(0, true);
    const parkedInMedian = inComplexMedian(physical.car);
    const exitHeading = physical.car.angle;
    until(() => physical.car.angle > exitHeading - Math.PI / 3, -1);
    until(() => physical.car.angle < exitHeading, 1);
    until(() => physical.car.x > t.x - 152);
    results.push({ name: '正式运动模型完成右转', waited: parkedInMedian,
      stage: physical.complexStage, violations: physical.violations });
    if (!parkedInMedian) throw new Error('vehicle cannot park fully inside median');
    driver.startLevel(4);
    driver.game.npcs = [];
    Object.assign(driver.game.car, { x: t.x, y: t.giveWayY - 19, angle: Math.PI });
    const canvas = document.querySelector('#game-canvas');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    driver.render(canvas.getContext('2d'), driver.game, rect.width, rect.height);
    return results;
  });
  for (const result of results) {
    assert.deepEqual(result.violations, [], `${result.name}: ${JSON.stringify(result.violations)}`);
    if (result.waited) assert.equal(result.stage, 'completed');
  }
  assert.equal(results[0].waited, true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'tools/complex-t-redesign.png' });
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      const canvas = document.querySelector('#game-canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width; canvas.height = rect.height;
      window.junctionTest.render(canvas.getContext('2d'), window.junctionTest.game, rect.width, rect.height);
    });
    await page.screenshot({ path: `tools/complex-t-${viewport.width > viewport.height ? 'landscape' : 'portrait'}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
