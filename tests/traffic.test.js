import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_POINTS, CROSSING, JUNCTIONS, REGIONS, SIGNAL_APPROACHES, WORLD } from '../src/data.js';
import { createNpcs, sampleRoute, updateNpcs } from '../src/npc.js';
import { controlDistance, createPedestrians, crossesFront, junctionConflict, junctionMovement, movementSignal,
  pedestrianCollision, pedestriansHavePriority, recordIndicator, rightArrowState, roundaboutEvents, roundaboutIndicator,
  roundaboutTurn, signalMustStop, updatePedestrians, updateStop, wrongSide } from '../src/rules.js';
const stop = CONTROL_POINTS.find(item => item.id === 'stop-t');
const parked = { x: stop.x, y: stop.y + 22, angle: 0, speed: 0 };
const away = { x: 75, y: 75, angle: 0, speed: 0 };

test('STOP 必须在线前真正停止：滑行、远处停车和车头过线均不计入', () => {
  for (const car of [{ ...parked, speed: 1 }, { ...parked, y: stop.y + 60 }, { ...parked, y: stop.y + 15 }]) {
    const state = {};
    for (let i = 0; i < 60; i++) updateStop(state, car, stop, 1 / 60);
    assert.equal(state.stopped || false, false);
  }
  const state = {};
  updateStop(state, parked, stop, .2);
  updateStop(state, { ...parked, speed: 2 }, stop, .1);
  assert.equal(state.dwell, 0, '滚动后不能累计先前的停稳时间');
  updateStop(state, parked, stop, .3);
  assert.equal(state.stopped, true);
  assert.ok(controlDistance(parked, stop) > 0);
});

test('停车后主路仍有车，NPC 继续等待直到安全', () => {
  const npc = createNpcs(2, 'normal', REGIONS.nz)[0];
  const marker = npc.route.markers.find(item => item.name === 'stop-t');
  npc.progress = marker.at - 3;
  Object.assign(npc, sampleRoute(npc.route, npc.progress), { speed: 0 });
  const mainCar = { x: stop.x + 95, y: stop.y - 25, angle: -Math.PI / 2, speed: 30 };
  for (let i = 0; i < 60; i++) updateNpcs([npc], 1 / 60, i / 60, REGIONS.nz, mainCar);
  assert.equal(npc.servedStop, 'stop-t');
  assert.equal(npc.speed, 0);
  assert.equal(npc.progress, marker.at - 3);
  for (let i = 0; i < 60; i++) updateNpcs([npc], 1 / 60, 1 + i / 60, REGIONS.nz, away);
  assert.ok(npc.progress > marker.at);
});

test('四个朝向都按车头越线，低速驶入对向车道也能被识别', () => {
  for (const control of SIGNAL_APPROACHES) {
    const car = { x: control.axis === 'x' ? control.position - control.direction * 20 : (control.laneMin + control.laneMax) / 2,
      y: control.axis === 'y' ? control.position - control.direction * 20 : (control.laneMin + control.laneMax) / 2, angle: control.heading };
    assert.equal(crossesFront(car, { ...car, [control.axis]: car[control.axis] + control.direction * 2 }, control), true);
  }
  assert.equal(wrongSide({ x: 245, y: 800 }, 0, true, REGIONS.nz), true);
  assert.equal(wrongSide({ x: 195, y: 800 }, 0, true, REGIONS.nz), false);
});

test('四个朝向的右转让对向直行和左转，双方右转不被误判', () => {
  const junction = JUNCTIONS.find(item => item.id === 'signal');
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const car = { x: junction.x - Math.sin(angle) * 80, y: junction.y + Math.cos(angle) * 80, angle, signal: 'right' };
    const other = { x: junction.x + Math.sin(angle) * 80, y: junction.y - Math.cos(angle) * 80, angle: angle + Math.PI, speed: 30 };
    for (const signal of [null, 'left']) assert.equal(junctionConflict(car, junction, [{ ...other, signal }], REGIONS.nz, junctionMovement(car, junction), angle % Math.PI === 0 ? 4 : 16), true);
    assert.equal(junctionConflict(car, junction, [{ ...other, signal: 'right' }], REGIONS.nz), false);
    assert.equal(junctionConflict({ ...car, signal: null }, junction, [other], REGIONS.nz), false);
  }
});

test('无信号路口使用相对右侧，驶离路口的远车不再阻塞', () => {
  const junction = JUNCTIONS.find(item => item.id === 'west-middle');
  const car = { x: junction.x - 25, y: junction.y + 100, angle: 0, signal: null };
  assert.equal(junctionConflict(car, junction, [{ x: junction.x + 90, y: junction.y + 25, angle: -Math.PI / 2, speed: 35 }], REGIONS.nz), true);
  assert.equal(junctionConflict(car, junction, [{ x: junction.x - 90, y: junction.y - 25, angle: Math.PI / 2, speed: 35 }], REGIONS.nz), false);
  assert.equal(junctionConflict(car, junction, [{ x: junction.x + 90, y: junction.y - 25, angle: Math.PI / 2, speed: 35 }], REGIONS.nz), false);
});

test('NZ 右转红箭头覆盖圆绿灯，专用绿箭头只放右转且不与横向绿灯冲突', () => {
  for (const approach of SIGNAL_APPROACHES) {
    const start = approach.axis === 'y' ? 0 : 12;
    assert.equal(movementSignal(start + 1, REGIONS.nz, approach, 'straight'), 'green');
    assert.equal(movementSignal(start + 1, REGIONS.nz, approach, 'right'), 'red');
    assert.equal(rightArrowState(start + 4, REGIONS.nz, approach), 'off');
    const arrowTime = approach.axis === 'y' ? 24 : 31;
    assert.equal(movementSignal(arrowTime, REGIONS.nz, approach, 'right'), 'green');
    assert.equal(movementSignal(arrowTime, REGIONS.nz, approach, 'straight'), 'red');
    for (const other of SIGNAL_APPROACHES.filter(item => item.axis !== approach.axis)) {
      assert.equal(movementSignal(arrowTime, REGIONS.nz, other, 'right'), 'red');
    }
    assert.equal(rightArrowState(arrowTime, REGIONS.uk, approach), 'off');
  }
});

test('黄灯判断记住亮起时停车距离，近距离无法安全停车可通过', () => {
  const approach = SIGNAL_APPROACHES[0];
  const far = { x: 575, y: approach.position + 120, angle: 0, speed: 70 };
  const close = { ...far, y: approach.position + 23 };
  const memory = {};
  assert.equal(signalMustStop(far, approach, 8.1, REGIONS.nz, 'straight', memory), true);
  assert.equal(signalMustStop(close, approach, 8.9, REGIONS.nz, 'straight', memory), true);
  assert.equal(signalMustStop(close, approach, 8.1, REGIONS.nz, 'straight', {}), false);
});

test('行人在等待和过街时有优先权，车辆通过后才迈入车道', () => {
  const pedestrians = createPedestrians();
  const car = { x: CROSSING.x - 35, y: CROSSING.y - 25, angle: Math.PI / 2, speed: 40 };
  updatePedestrians(pedestrians, 4, [car]);
  assert.equal(pedestrians[0].state, 'waiting');
  assert.equal(pedestriansHavePriority(pedestrians), true);
  updatePedestrians(pedestrians, .1, [{ ...car, speed: 0 }]);
  assert.equal(pedestrians[0].state, 'crossing');
  assert.equal(pedestrianCollision({ ...car, x: pedestrians[0].x, y: pedestrians[0].y }, pedestrians[0]), true);
  for (let i = 0; i < 600; i++) updatePedestrians(pedestrians, 1 / 60, [away]);
  assert.equal(pedestrians[0].state, 'rest');
});

test('NPC 在斑马线车头前停住，行人离开后恢复循环', () => {
  const npc = createNpcs(2, 'normal', REGIONS.nz)[0];
  const marker = npc.route.markers.find(item => item.name === 'pedestrian');
  npc.progress = marker.at - 60;
  Object.assign(npc, sampleRoute(npc.route, npc.progress), { speed: 30 });
  const pedestrians = [{ state: 'waiting' }];
  for (let i = 0; i < 420; i++) updateNpcs([npc], 1 / 60, i / 60, REGIONS.nz, away, pedestrians);
  assert.equal(npc.speed, 0);
  assert.ok(npc.x + 19 < CROSSING.x);
  for (let i = 0; i < 240; i++) updateNpcs([npc], 1 / 60, 7 + i / 60, REGIONS.nz, away, []);
  assert.ok(npc.x - 19 > CROSSING.x + CROSSING.width);
});

test('环岛左转、直行、右转入口灯及前一出口后的左灯', () => {
  const entry = Math.PI;
  assert.equal(roundaboutTurn(entry, Math.PI * 1.5), 'left');
  assert.equal(roundaboutTurn(entry, 0), 'straight');
  assert.equal(roundaboutTurn(entry, Math.PI / 2), 'right');
  const p = a => ({ x: WORLD.roundabout.x + Math.sin(a) * 82, y: WORLD.roundabout.y - Math.cos(a) * 82 });
  assert.equal(roundaboutIndicator(entry, 0, p(entry), false), null);
  assert.equal(roundaboutIndicator(entry, Math.PI / 2, p(entry), false), 'right');
  assert.equal(roundaboutIndicator(entry, Math.PI / 2, p(Math.PI * 1.5), true), 'right');
  assert.equal(roundaboutIndicator(entry, Math.PI / 2, p(.1), true), 'left');
});

test('环岛实际通过记录区分提前示意、过早打出口灯和逆向', () => {
  function drive(entrySignal, switchAt, lead = 4) {
    const state = {}, car = { x: 600, y: 760, angle: 0, speed: 30, signal: entrySignal, signalSince: -lead };
    let previous = { ...car }, time = 0, events = [];
    roundaboutEvents(state, previous, car, time, REGIONS.nz);
    for (let i = 0; i <= 100; i++) {
      previous = { ...car }; time += .1;
      const a = Math.PI + i / 100 * Math.PI * 1.5;
      const radius = i < 5 ? 134 - i * 10 : i > 95 ? 82 + (i - 95) * 12 : 82;
      Object.assign(car, { x: 600 + Math.sin(a) * radius, y: 600 - Math.cos(a) * radius, angle: a + Math.PI / 2 });
      if (i >= switchAt && car.signal !== 'left') { car.signal = 'left'; car.signalSince = time; }
      events.push(...roundaboutEvents(state, previous, car, time, REGIONS.nz));
    }
    return events;
  }
  assert.deepEqual(drive('right', 70), []);
  assert.ok(drive(null, 70).includes('round-entry-signal'));
  assert.ok(drive('right', 30).includes('round-exit-early'));
  assert.ok(drive('right', 70, 0).includes('round-entry-late'));
  const a = Math.PI - .0001;
  const car = { x: 600 + Math.sin(a) * 82, y: 600 - Math.cos(a) * 82, angle: a - Math.PI / 2, speed: 2, signal: 'right' };
  assert.ok(roundaboutEvents({ active: { arm: Math.PI, entered: true } }, { x: 600, y: 682 }, car, 5, REGIONS.nz).includes('round-wrong-way'));

});

test('行人加入自由车流后持续循环，无碰撞且 NPC 的环岛示意符合玩家判定', () => {
  const npcs = createNpcs(8, 'normal', REGIONS.nz), pedestrians = createPedestrians();
  const states = npcs.map(() => ({})), laps = npcs.map(() => 0);
  let pedestrianWaits = 0, oncomingPasses = 0;
  const southbound = SIGNAL_APPROACHES.find(item => item.id === 'southbound');
  for (let frame = 0; frame < 36000; frame++) {
    const previous = npcs.map(npc => ({ ...npc }));
    updatePedestrians(pedestrians, 1 / 60, [...npcs, away]);
    updateNpcs(npcs, 1 / 60, frame / 60, REGIONS.nz, away, pedestrians);
    for (const [i, npc] of npcs.entries()) {
      if (npc.progress < previous[i].progress) laps[i]++;
      if (npc.waiting === 'pedestrian') pedestrianWaits++;
      if (npc.route.id === 'signal-oncoming' && crossesFront(previous[i], npc, southbound)) oncomingPasses++;
      assert.equal(pedestrians.some(person => pedestrianCollision(npc, person)), false, npc.route.id);
      recordIndicator(npc, frame / 60);
      assert.deepEqual(roundaboutEvents(states[i], previous[i], npc, frame / 60, REGIONS.nz), [], npc.route.id);
    }
  }
  assert.ok(pedestrianWaits > 0);
  assert.ok(oncomingPasses >= 2);
  assert.ok(laps.every(count => count >= 2));
});

test('NPC 实际接近信号口：红箭头等待、专用绿箭头右转', () => {
  // 构造一段可行驶的右转轨迹，覆盖 NPC 调度与共享灯号函数之间的连接。
  const points = [{ x: 575, y: 330 }, { x: 575, y: 259 }, { x: 575, y: 230 },
    { x: 580, y: 195 }, { x: 600, y: 172 }, { x: 640, y: 165 }, { x: 750, y: 165 }];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const npc = createNpcs(2, 'normal', REGIONS.nz)[0];
  npc.route = { id: 'test-right', points, lengths, length: lengths.at(-1),
    markers: [{ name: 'northbound', at: 71 }], turns: [{ start: 60, end: 250, turn: 'right' }],
    junctionPasses: [{ junctionId: 'signal', start: 60, end: 250, heading: 0, turn: 'right' }],
    roundabout: { entry: Infinity, exit: Infinity } };
  npc.progress = 0; Object.assign(npc, sampleRoute(npc.route, 0), { speed: 30 });
  for (let frame = 0; frame < 360; frame++) updateNpcs([npc], 1 / 60, 1, REGIONS.nz, away);
  assert.equal(npc.speed, 0);
  assert.ok(npc.y - 19 > 240);
  for (let frame = 0; frame < 300; frame++) updateNpcs([npc], 1 / 60, 24, REGIONS.nz, away);
  assert.ok(npc.x > 640);
});

test('复杂 T 的穿越与汇入分别检查对应方向的交通', async () => {
  const { COMPLEX_T: t } = await import('../src/data.js');
  const { complexTrafficConflict } = await import('../src/rules.js');
  const east = { x: t.x - 80, y: t.eastboundLane, angle: Math.PI / 2, speed: 40 };
  const west = { x: t.x - 60, y: t.westboundLane, angle: -Math.PI / 2, speed: 40 };
  assert.equal(complexTrafficConflict([east], 'entry'), true);
  assert.equal(complexTrafficConflict([west], 'entry'), false);
  assert.equal(complexTrafficConflict([east], 'exit'), false);
  assert.equal(complexTrafficConflict([west], 'exit'), true);
  assert.equal(complexTrafficConflict([{ ...east, x: t.x + 100 }], 'entry'), false);
});
