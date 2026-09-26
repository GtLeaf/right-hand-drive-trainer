import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, CONTROL_POINTS, LEVELS, REGIONS, SIGNAL_APPROACHES, WORLD } from '../src/data.js';
import { createNpcs, npcRoutes, sampleRoute, updateNpcs } from '../src/npc.js';
import { crossesControl, distance, isOnRoad, signalForApproach } from '../src/rules.js';

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

  test(`${region.code} 三条 NPC 路线沿道路闭合并进出环岛`, () => {
    const routes = npcRoutes(region);
    assert.equal(routes.length, 3);
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
        assert.ok(frozen < 15 * 60, `stalled: ${npc.id}`);
        if (npc.waiting === 'bridge-west') bridgeWaits += 1;
        if (npc.route.id === 'town') {
          if (!prior.servedStop && npc.servedStop) stopVisits.set(npc.id, stopVisits.get(npc.id) + 1);
          if (crossesControl(prior, npc, stop)) {
            assert.equal(prior.servedStop, 'stop-t');
            stopPasses.set(npc.id, stopPasses.get(npc.id) + 1);
          }
          if (crossesControl(prior, npc, eastbound)) {
            assert.equal(signalForApproach(elapsed, region, eastbound), 'green');
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

test('NPC 在 STOP 线前按实际帧时长停满 0.8 秒', () => {
  const npc = createNpcs(2, 'normal', REGIONS.nz)[0];
  const stop = npc.route.markers.find(marker => marker.name === 'stop-t');
  npc.progress = stop.at - 3;
  Object.assign(npc, sampleRoute(npc.route, npc.progress), { speed: 0 });
  for (let step = 0; step < 3; step += 1) {
    updateNpcs([npc], .2, step * .2, REGIONS.nz, { x: 75, y: 75 });
    assert.equal(npc.progress, stop.at - 3);
    assert.equal(npc.servedStop, null);
  }
  updateNpcs([npc], .2, .6, REGIONS.nz, { x: 75, y: 75 });
  assert.equal(npc.servedStop, 'stop-t');
  assert.ok(npc.progress > stop.at - 3);
});
