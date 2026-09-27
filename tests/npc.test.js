import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, COMPLEX_T, CONTROL_POINTS, LEVELS, REGIONS, SIGNAL_APPROACHES, WORLD } from '../src/data.js';
import { createNpcs, npcRoutes, sampleRoute, updateNpcs } from '../src/npc.js';
import { crossesControl, crossesFront, distance, inBridgeCorridor, inComplexMedian, isOnRoad, wrongSide, signalForApproach } from '../src/rules.js';

test('窄桥同时到达时优先端先行，预留覆盖引道且双方最终通过', () => {
  for (const reverse of [false, true]) {
    const npcs = createNpcs(7, 'normal', REGIONS.nz).filter(npc => npc.route.id.startsWith('lower-'));
    if (reverse) npcs.reverse();
    for (const npc of npcs) {
      const name = npc.route.id === 'lower-east' ? 'bridge-west' : 'bridge-east';
      npc.progress = npc.route.markers.find(marker => marker.name === name).at - 3;
      Object.assign(npc, sampleRoute(npc.route, npc.progress), { speed: 0 });
    }
    const admitted = [];
    const cleared = new Set();
    for (let frame = 0; frame < 1800; frame++) {
      updateNpcs(npcs, 1 / 60, frame / 60, REGIONS.nz, { x: 75, y: 75 });
      const reserved = npcs.filter(npc => npc.bridgeDirection);
      assert.ok(reserved.length <= 1, '双向车辆同时获准驶入桥头');
      assert.ok(npcs.filter(inBridgeCorridor).length <= 1, '双向车辆同时占用引道');
      for (const npc of reserved) if (!admitted.includes(npc.route.id)) admitted.push(npc.route.id);
      for (const npc of npcs) if (admitted.includes(npc.route.id) && !npc.bridgeDirection) cleared.add(npc.route.id);
      if (cleared.size === 2) break;
    }
    assert.deepEqual(admitted, ['lower-west', 'lower-east']);
    assert.equal(cleared.size, 2, '双方都应驶出桥头，释放通行预留');
  }
});

for (const region of Object.values(REGIONS)) {
  test(`${region.code} 所有关卡的玩家与 NPC 都从环岛外起步`, () => {
    for (const level of LEVELS) {
      assert.ok(distance(level.start, WORLD.roundabout) >= WORLD.roundabout.outer + 20, `player level ${level.id}`);
      for (const density of ['low', 'normal']) {
        const npcs = createNpcs(level.id, density, region);
        for (const npc of npcs) {
          assert.ok(distance(npc, WORLD.roundabout) >= WORLD.roundabout.outer + 20, `npc ${npc.id}, level ${level.id}, ${density}`);
          assert.ok(distance(npc, level.start) >= 40, `overlapping player: ${npc.id}, level ${level.id}`);
        }
      }
    }
  });

  test(`${region.code} 全关卡低/标准车流中的每辆 NPC 持续存在且不跳位`, () => {
    for (const level of LEVELS) for (const density of ['low', 'normal']) {
      const npcs = createNpcs(level.id, density, region);
      const originals = [...npcs];
      const laps = new Map(npcs.map(npc => [npc.id, 0]));
      for (let frame = 0; frame < 18000; frame += 1) {
        const positions = npcs.map(npc => ({ x: npc.x, y: npc.y, progress: npc.progress }));
        updateNpcs(npcs, 1 / 60, frame / 60, region, { x: 75, y: 75 });
        assert.equal(npcs.length, originals.length);
        for (const [index, npc] of npcs.entries()) {
          assert.equal(npc, originals[index], `disappeared: ${region.code}, level ${level.id}, ${density}, ${index}`);
          assert.ok(distance(npc, positions[index]) <= npc.cruiseSpeed / 60 + .01, `jumped: ${region.code}, level ${level.id}, ${density}, ${index}`);
          if (npc.progress < positions[index].progress) laps.set(npc.id, laps.get(npc.id) + 1);
        }
      }
      for (const npc of npcs) assert.ok(laps.get(npc.id) >= 2, `loop stalled: ${region.code}, level ${level.id}, ${density}, ${npc.id}`);
    }
  });

  test(`${region.code} 六条 NPC 路线沿道路闭合并进出环岛`, () => {
    const routes = npcRoutes(region);
    assert.equal(routes.length, 6);
    for (const route of routes) {
      assert.ok(route.length > 900, route.id);
      assert.ok(route.markers.some(marker => marker.name === 'ring-exit'), route.id);
      assert.ok(distance(sampleRoute(route, 0), sampleRoute(route, route.length - .01)) < .02, route.id);
      assert.deepEqual(sampleRoute(route, 10), sampleRoute(route, route.length + 10));
      for (let index = 0; index < route.points.length; index += 1) {
        assert.ok(isOnRoad(route.points[index], region), `${route.id} point ${index}`);
        if (index) assert.ok(distance(route.points[index - 1], route.points[index]) < 9, route.id);
      }
      assert.ok(route.points.some(point => {
        const radius = distance(point, WORLD.roundabout);
        return radius > WORLD.roundabout.inner && radius < WORLD.roundabout.outer;
      }), route.id);
    }
  });

  test(`${region.code} 十分钟 NPC 不瞬移、不闯红灯、不互锁`, () => {
    const npcs = createNpcs(7, 'normal', region);
    // 明确安排双向车同时到桥头，验证让行而不依赖循环路线的偶然会车时机。
    if (region.bridge) for (const npc of npcs.filter(npc => npc.route.id.startsWith('lower-'))) {
      const name = npc.route.id === 'lower-east' ? 'bridge-west' : 'bridge-east';
      npc.progress = npc.route.markers.find(marker => marker.name === name).at - 3;
      Object.assign(npc, sampleRoute(npc.route, npc.progress), { speed: 0 });
    }
    const player = { x: 75, y: 75 };
    const laps = new Map(npcs.map(npc => [npc.id, 0]));
    const stationary = new Map(npcs.map(npc => [npc.id, 0]));
    const stopVisits = new Map(npcs.filter(npc => npc.route.id === 'town').map(npc => [npc.id, 0]));
    const stopPasses = new Map(stopVisits);
    let bridgeWaits = 0;
    const stop = CONTROL_POINTS.find(control => control.id === 'stop-t');
    const eastbound = SIGNAL_APPROACHES.find(approach => approach.id === 'eastbound');

    for (let frame = 0; frame < 60000; frame += 1) {
      const previous = npcs.map(npc => ({ x: npc.x, y: npc.y, angle: npc.angle,
        progress: npc.progress, servedStop: npc.servedStop }));
      const elapsed = frame / 60;
      updateNpcs(npcs, 1 / 60, elapsed, region, player);
      for (const [index, npc] of npcs.entries()) {
        const prior = previous[index];
        assert.ok(distance(prior, npc) <= npc.cruiseSpeed / 60 + .01, `jump: ${npc.id}`);
        assert.ok(isOnRoad(npc, region), `off road: ${npc.id}`);
        if (npc.progress < prior.progress) laps.set(npc.id, laps.get(npc.id) + 1);
        const frozen = npc.progress === prior.progress ? stationary.get(npc.id) + 1 : 0;
        stationary.set(npc.id, frozen);
        // NZ 新增箭头相位，直行队列可等待一个完整灯周期。
        const limit = SIGNAL_APPROACHES.some(item => item.id === npc.waiting) ? 40 : 15;
        assert.ok(frozen < limit * 60, `stalled: ${npc.id}`);
        if (npc.waiting === 'bridge-west') bridgeWaits += 1;
        if (npc.route.id === 'town') {
          if (!prior.servedStop && npc.servedStop) stopVisits.set(npc.id, stopVisits.get(npc.id) + 1);
          if (crossesFront(prior, npc, stop)) {
            assert.equal(prior.servedStop, 'stop-t');
            stopPasses.set(npc.id, stopPasses.get(npc.id) + 1);
          }
          if (crossesFront(prior, npc, eastbound)) {
            const light = signalForApproach(elapsed, region, eastbound);
            assert.ok(light === 'green' || light === 'amber' && npc.signalMemory?.stopOnAmber === false, 'unsafe signal crossing');
          }
        }
        for (const other of npcs.slice(index + 1)) assert.ok(distance(npc, other) >= 24, `collision: ${npc.id} / ${other.id}`);
      }
      if (region.bridge) {
        const onBridge = npcs.filter(npc => npc.x >= BRIDGE.from && npc.x <= BRIDGE.to && Math.abs(npc.y - BRIDGE.y) < 30);
        assert.ok(onBridge.length <= 1, 'opposing cars on bridge');
      }
    }

    for (const npc of npcs) assert.ok(laps.get(npc.id) >= 2, `unfinished loop: ${npc.id}`);
    for (const [id, visits] of stopVisits) {
      assert.ok(visits >= 2, `stop not repeated: ${id}`);
      assert.ok(visits === stopPasses.get(id) || visits === stopPasses.get(id) + 1);
    }
    if (region.bridge) assert.ok(bridgeWaits > 0, 'no bridge yield occurred');
  });
}

test('NPC 在 STOP 线前完全停止后再放行，不把固定等待秒数当成交规', () => {
  const npc = createNpcs(2, 'normal', REGIONS.nz)[0];
  const stop = npc.route.markers.find(marker => marker.name === 'stop-t');
  npc.progress = stop.at - 3;
  Object.assign(npc, sampleRoute(npc.route, npc.progress), { speed: 0 });
  updateNpcs([npc], .2, 0, REGIONS.nz, { x: 75, y: 75 });
  assert.equal(npc.progress, stop.at - 3);
  assert.equal(npc.servedStop, null);
  updateNpcs([npc], .1, .2, REGIONS.nz, { x: 75, y: 75 });
  assert.equal(npc.servedStop, 'stop-t');
  assert.ok(npc.progress > stop.at - 3);
});

for (const region of Object.values(REGIONS)) {
  test(`${region.code} 复杂 T NPC 使用 GIVE WAY 和中央等待区控制点`, () => {
    const route = npcRoutes(region, true)[0];
    assert.ok(route.markers.some(marker => marker.name === 'complex-give'));
    assert.ok(route.markers.some(marker => marker.name === 'complex-median'));
    assert.ok(distance(sampleRoute(route, 0), sampleRoute(route, route.length - .01)) < .02);
    for (const point of route.points) assert.equal(isOnRoad(point, region, true), true);
    for (let progress = 0; progress < route.length; progress += 2) {
      const point = sampleRoute(route, progress);
      assert.equal(wrongSide(point, point.angle, true), false, `wrong side at ${point.x},${point.y}`);
    }
    const give = route.markers.find(marker => marker.name === 'complex-give');
    const stopped = sampleRoute(route, give.at - 3);
    assert.ok(stopped.y + 19 < COMPLEX_T.giveWayY, 'front bumper before give-way line');
  });

  test(`${region.code} 复杂 T NPC 不同时占用中央等待区`, () => {
    const npcs = createNpcs(4, 'normal', region);
    for (let frame = 0; frame < 24000; frame += 1) {
      updateNpcs(npcs, 1 / 60, frame / 60, region, { x: 75, y: 75 });
      const occupants = npcs.filter(inComplexMedian);
      assert.ok(occupants.length <= 1, `multiple median occupants: ${region.code}`);
    }
  });
}

for (const region of Object.values(REGIONS)) {
  test(`${region.code} 扩展街区六辆车十分钟循环、主路双向通车且无互锁`, () => {
    const npcs = createNpcs(8, 'normal', region);
    assert.equal(npcs.length, 6);
    const stationary = new Map(npcs.map(npc => [npc.id, 0]));
    const laps = new Map(npcs.map(npc => [npc.id, 0]));
    const seen = new Set();
    for (let frame = 0; frame < 36000; frame++) {
      const previous = npcs.map(npc => ({ ...npc }));
      updateNpcs(npcs, 1 / 60, frame / 60, region, { x: 75, y: 75 });
      for (const [index, npc] of npcs.entries()) {
        const prior = previous[index];
        assert.ok(isOnRoad(npc, region, true), `off road: ${npc.route.id}`);
        const frozen = npc.progress === prior.progress ? stationary.get(npc.id) + 1 : 0;
        stationary.set(npc.id, frozen);
        assert.ok(frozen < 30 * 60, `stalled: ${npc.route.id}`);
        if (npc.progress < prior.progress) laps.set(npc.id, laps.get(npc.id) + 1);
        for (const other of npcs.slice(index + 1)) assert.ok(distance(npc, other) >= 24, `collision: ${npc.id}/${other.id}`);
        for (const approach of SIGNAL_APPROACHES) {
          if (crossesFront(prior, npc, approach)) {
            const light = signalForApproach(frame / 60, region, approach);
            assert.ok(light === 'green' || light === 'amber' && npc.signalMemory?.stopOnAmber === false, 'unsafe signal crossing');
          }
        }
        if (Math.abs(npc.x - COMPLEX_T.x) < 50) {
          if (Math.abs(npc.y - COMPLEX_T.eastboundLane) < 10 && Math.sin(npc.angle) > .9) seen.add('east');
          if (Math.abs(npc.y - COMPLEX_T.westboundLane) < 10 && Math.sin(npc.angle) < -.9) seen.add('west');
        }
      }
    }
    assert.deepEqual([...seen].sort(), ['east', 'west']);
    for (const count of laps.values()) assert.ok(count >= 2, 'route failed to circulate');
  });
}
