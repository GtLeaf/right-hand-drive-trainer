import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, COMPLEX_T, LAYOUT, LEVELS, REGIONS, WORLD } from '../src/data.js';
import { crossed, crossesControl, inComplexMedian, isOnRoad, lightState, signalApproachForCar, steeringStep, wrongSide } from '../src/rules.js';
import { SIGNAL_APPROACHES } from '../src/data.js';
const L = LAYOUT;
const t = COMPLEX_T;

test('新西兰灯号没有英国红黄同亮阶段', () => {
  assert.equal(lightState(22.5, REGIONS.nz), 'red');
  assert.equal(lightState(22.5, REGIONS.uk), 'redAmber');
  assert.equal(lightState(4, REGIONS.nz), 'green');
  assert.equal(lightState(9, REGIONS.nz), 'amber');
  for (let time = 0; time < 23; time += .1) {
    assert.ok(!(lightState(time, REGIONS.nz) === 'green' && lightState(time, REGIONS.nz, true) === 'green'));
    assert.ok(!(lightState(time, REGIONS.uk) === 'green' && lightState(time, REGIONS.uk, true) === 'green'));
  }
});

test('四个方向都绑定各自的停车线与信号', () => {
  for (const approach of SIGNAL_APPROACHES) {
    const from = { x: approach.axis === 'x' ? approach.position - approach.direction * 6 : (approach.laneMin + approach.laneMax) / 2,
      y: approach.axis === 'y' ? approach.position - approach.direction * 6 : (approach.laneMin + approach.laneMax) / 2,
      angle: approach.heading };
    const to = { ...from, [approach.axis]: approach.position + approach.direction * 6 };
    assert.equal(crossesControl(from, to, approach), true, approach.id);
    assert.equal(signalApproachForCar(from)?.id, approach.id);
  }
});

test('左右车道根据行驶方向判定', () => {
  assert.equal(wrongSide({ x: L.west - 25, y: L.middle + 200 }, 0), false);
  assert.equal(wrongSide({ x: L.west + 25, y: L.middle + 200 }, 0), true);
  assert.equal(wrongSide({ x: L.west + 25, y: L.middle + 200 }, Math.PI), false);
  assert.equal(wrongSide({ x: L.west - 25, y: L.middle + 200 }, Math.PI), true);
});

test('路面包含直路和环岛，不包含中心岛', () => {
  assert.equal(isOnRoad({ x: L.west - 25, y: L.middle + 200 }), true);
  assert.equal(isOnRoad({ x: WORLD.roundabout.x, y: WORLD.roundabout.y - 80 }), true);
  assert.equal(isOnRoad({ x: WORLD.roundabout.x, y: WORLD.roundabout.y }), false);
  assert.equal(isOnRoad({ x: 20, y: 20 }), false);
});

test('窄桥两端渐缩、桥面单车道，英国仍保留双车道', () => {
  const b = BRIDGE;
  for (const x of [(b.taperWest + b.from) / 2, (b.to + b.taperEast) / 2]) {
    for (const side of [-1, 1]) {
      assert.equal(isOnRoad({ x, y: b.y + side * 34 }, REGIONS.nz), true);
      assert.equal(isOnRoad({ x, y: b.y + side * 35 }, REGIONS.nz), false);
      assert.equal(isOnRoad({ x, y: b.y + side * 40 }, REGIONS.uk), true);
    }
  }
  for (const x of [b.from, (b.from + b.to) / 2, b.to]) {
    assert.equal(isOnRoad({ x, y: b.y + 22 }, REGIONS.nz), true);
    assert.equal(isOnRoad({ x, y: b.y - 23 }, REGIONS.nz), false);
    assert.equal(isOnRoad({ x, y: b.y - 25 }, REGIONS.uk), true);
  }
});

test('复杂 T 字口包含主路加宽、支路和左右主路车道', () => {
  assert.equal(LEVELS.length, 8);
  assert.equal(LEVELS[3].scenario, 'complex-t');
  assert.equal(LEVELS[7].free, true);
  assert.equal(isOnRoad({ x: COMPLEX_T.mainFullFrom + 20, y: COMPLEX_T.y + 70 }, REGIONS.nz, true), true);
  assert.equal(isOnRoad({ x: COMPLEX_T.x, y: COMPLEX_T.giveWayY }, REGIONS.nz, true), true);
  assert.equal(wrongSide({ x: t.mainFullFrom + 40, y: COMPLEX_T.eastboundLane }, Math.PI / 2, true), false);
  assert.equal(wrongSide({ x: t.mainFullFrom + 40, y: COMPLEX_T.westboundLane }, Math.PI / 2, true), true);
});

test('越线检测只匹配正确方向', () => {
  assert.equal(crossed({ x: 10 }, { x: 20 }, 'x', 15, 1), true);
  assert.equal(crossed({ y: 20 }, { y: 10 }, 'y', 15, -1), true);
  assert.equal(crossed({ y: 20 }, { y: 10 }, 'y', 15, 1), false);
});

test('油门、刹车和转向更新位置与速度', () => {
  const car = { x: 185, y: 650, angle: 0, speed: 0 };
  steeringStep(car, { throttle: true, brake: false, steer: 0 }, 1);
  assert.ok(car.speed > 0);
  assert.ok(car.y < 650);
  steeringStep(car, { throttle: false, brake: true, steer: 1 }, .2);
  assert.ok(car.angle > 0);
  assert.ok(car.speed < 68);
});


test('复杂路口的两条驶入车道和独立出口按各自行驶方向判定', () => {
  for (const x of [COMPLEX_T.branchLeftLane, COMPLEX_T.branchRightLane]) {
    assert.equal(wrongSide({ x, y: t.giveWayY - 29 }, Math.PI, true), false);
    assert.equal(wrongSide({ x, y: t.giveWayY - 29 }, 0, true), true);
  }
  assert.equal(wrongSide({ x: COMPLEX_T.branchExitLane, y: t.giveWayY - 29 }, 0, true), false);
  assert.equal(wrongSide({ x: COMPLEX_T.branchExitLane, y: t.giveWayY - 29 }, Math.PI, true), true);
  assert.equal(wrongSide({ x: t.x + 25, y: t.branchTaperFrom + 10 }, Math.PI, true), false);
  assert.equal(wrongSide({ x: t.x - 25, y: t.branchTaperFrom + 10 }, 0, true), false);
});

test('加宽和圆角的道路范围仅在复杂场景生效', () => {
  assert.equal(isOnRoad({ x: t.mainFullFrom + 50, y: t.y + 70 }, REGIONS.nz, true), true);
  assert.equal(isOnRoad({ x: t.mainFullFrom + 50, y: t.y + 70 }, REGIONS.nz, false), false);
  assert.equal(isOnRoad({ x: t.branchWestEdge + 3, y: t.y - 90 }, REGIONS.nz, true), true);
  assert.equal(isOnRoad({ x: t.branchWestEdge - 10, y: t.giveWayY + 1 }, REGIONS.nz, true), false);
  assert.equal(isOnRoad({ x: t.branchEastEdge - 2, y: t.branchTaperFrom + 10 }, REGIONS.nz, true), false);
  assert.equal(isOnRoad({ x: t.mainFrom + 30, y: t.y + 75 }, REGIONS.nz, true), false);
});

test('等待位置容纳完整横向车身，让行线前车身不侵入主路', () => {
  for (const dx of [-19, 19]) for (const dy of [-11, 11]) {
    assert.equal(inComplexMedian({ x: COMPLEX_T.medianWaitX + dx, y: COMPLEX_T.y + dy }), true);
  }
  assert.ok(COMPLEX_T.giveWayY + 19 < COMPLEX_T.y - COMPLEX_T.mainWidth / 2);
  const give = { x: COMPLEX_T.branchRightLane, y: COMPLEX_T.giveWayY,
    axis: 'y', direction: 1, laneAxis: 'x', laneMin: COMPLEX_T.branchDividerX, laneMax: COMPLEX_T.branchEastEdge };
  for (const x of [COMPLEX_T.branchLeftLane, COMPLEX_T.branchRightLane]) {
    assert.equal(crossesControl({ x, y: give.y - 1 }, { x, y: give.y + 1, angle: Math.PI }, give), true);
  }
  assert.equal(crossesControl({ x: COMPLEX_T.branchExitLane, y: give.y - 1 },
    { x: COMPLEX_T.branchExitLane, y: give.y + 1, angle: Math.PI }, give), false);
});

test('扩大地图保留车道尺度，并给复杂路口与环岛留出独立接近路段', () => {
  assert.equal(WORLD.width, 1600);
  assert.equal(WORLD.height, 1200);
  assert.ok(t.x - WORLD.roundabout.x >= 500);
  assert.ok(t.giveWayY - t.branchFullFrom >= 120);
  assert.ok(t.mainTo - t.x >= 250);
  assert.equal(WORLD.roundabout.outer, 113);
  for (const level of LEVELS) {
    const complex = level.scenario === 'complex-t' || level.free;
    for (const point of [level.start, ...level.checkpoints]) {
      assert.ok(isOnRoad(point, REGIONS.nz, complex), `level ${level.id}: ${JSON.stringify(point)}`);
      assert.ok(point.x > 0 && point.x < WORLD.width && point.y > 0 && point.y < WORLD.height);
    }
  }
});

test('新增东侧连接道路上下贯通，车辆可驶入原地图边界之外', () => {
  for (let y = L.north + 60; y <= L.south - 60; y += 10) {
    assert.ok(isOnRoad({ x: L.east - 25, y }, REGIONS.nz, true));
  }
  for (let x = t.mainTo; x <= L.east; x += 5) {
    assert.ok(isOnRoad({ x, y: L.middle - 25 }, REGIONS.nz, true));
    assert.ok(isOnRoad({ x, y: L.middle + 25 }, REGIONS.nz, true));
  }
  const car = { x: 1350, y: L.south - 25, angle: Math.PI / 2, speed: 30 };
  steeringStep(car, { throttle: true, brake: false, steer: 0 }, .1);
  assert.ok(car.x > 1350 && car.y > 880);
  assert.ok(isOnRoad(car, REGIONS.nz, true));
});
