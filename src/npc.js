import { BRIDGE, COMPLEX_T, CONTROL_POINTS, CROSSING, JUNCTIONS, LAYOUT, LEVELS, SIGNAL_APPROACHES, WORLD } from './data.js';
import { clamp, distance, inBridgeCorridor, inComplexMedian, complexTrafficConflict, updateStop, signalMustStop, junctionMovement, junctionConflict, movementsConflict, turnFrom, headingFor, roundaboutConflict, roundaboutIndicator, ringArm, pedestriansHavePriority } from './rules.js';

function createRoute(id) {
  const points = [];
  const markers = [];
  const add = (pointX, pointY) => {
    if (!points.length || distance(points.at(-1), { x: pointX, y: pointY }) > .01) points.push({ x: pointX, y: pointY });
  };
  return {
    id,
    move(pointX, pointY) { add(pointX, pointY); return this; },
    line(endX, endY) {
      const start = points.at(-1);
      const steps = Math.max(1, Math.ceil(distance(start, { x: endX, y: endY }) / 8));
      for (let step = 1; step <= steps; step += 1) add(start.x + (endX - start.x) * step / steps, start.y + (endY - start.y) * step / steps);
      return this;
    },
    curve(controlX, controlY, endX, endY) {
      const start = points.at(-1);
      const steps = Math.max(10, Math.ceil((distance(start, { x: controlX, y: controlY }) + distance({ x: controlX, y: controlY }, { x: endX, y: endY })) / 7));
      for (let step = 1; step <= steps; step += 1) {
        const time = step / steps;
        const inverse = 1 - time;
        add(inverse * inverse * start.x + 2 * inverse * time * controlX + time * time * endX,
          inverse * inverse * start.y + 2 * inverse * time * controlY + time * time * endY);
      }
      return this;
    },
    turn(cx, cy, radius, from, to) {
      const steps = Math.ceil(Math.abs(to - from) * radius / 5);
      for (let step = 1; step <= steps; step++) {
        const angle = from + (to - from) * step / steps;
        add(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      }
      return this;
    },
    arc(from, to) {
      const steps = Math.ceil((to - from) * 82 / 8);
      for (let step = 1; step <= steps; step += 1) {
        const angle = from + (to - from) * step / steps;
        add(WORLD.roundabout.x + Math.sin(angle) * 82, WORLD.roundabout.y - Math.cos(angle) * 82);
      }
      return this;
    },
    mark(name) { markers.push({ name, index: points.length - 1 }); return this; },
    finish() {
      this.line(points[0].x, points[0].y);
      const lengths = [0];
      for (let index = 1; index < points.length; index += 1) lengths.push(lengths.at(-1) + distance(points[index - 1], points[index]));
      return { id, points, lengths, length: lengths.at(-1),
        markers: markers.map(marker => ({ name: marker.name, at: lengths[marker.index] })) };
    }
  };
}

const L = LAYOUT;
const ringPoint = angle => [L.center + Math.sin(angle) * 82, L.middle - Math.cos(angle) * 82];

function townRoute(complex = false) {
  const route = createRoute('town').move(L.west - 25, L.north + 180)
    .line(L.west - 25, L.north + 50).mark('stop-t').line(L.west - 25, L.north + 42)
    .curve(L.west - 25, L.north - 25, L.west + 50, L.north - 25)
    .line(CROSSING.x - 27, L.north - 25).mark('pedestrian').line(L.center - 50, L.north - 25).mark('eastbound').line(L.branch - 50, L.north - 25)
    .curve(L.branch + 25, L.north - 25, L.branch + 25, L.north + 50);
  if (complex) {
    const t = COMPLEX_T;
    route.line(L.branch + 25, t.branchTaperFrom)
      .curve(L.branch + 25, t.branchFullFrom - 35, t.branchRightLane, t.branchFullFrom)
      .line(t.branchRightLane, t.giveWayY - 22).mark('complex-give')
      .line(t.branchRightLane, t.y - 50)
      .turn(t.medianWaitX, t.y - 50, 50, 0, Math.PI / 2).mark('complex-median')
      .curve(t.x - 90, t.y, t.x - 110, t.y + 26)
      .curve(t.x - 130, t.westboundLane, t.x - 170, t.westboundLane)
      .line(t.mainFullFrom, t.westboundLane).line(t.mainFrom, t.y + 25);
  } else {
    route.line(L.branch + 25, L.middle - 48).mark('give-t').line(L.branch + 25, L.middle - 40)
      .curve(L.branch + 25, L.middle + 25, L.branch - 50, L.middle + 25);
  }
  return route.line(L.center + 115, L.middle + 25).mark('round-east')
    .line(...ringPoint(1.875)).arc(1.875, 4.4).mark('ring-exit')
    .line(L.center - 120, L.middle + 25)
    .line(L.west + 90, L.middle + 25).mark('west-middle-east').line(L.west + 25, L.middle + 25)
    .curve(L.west - 25, L.middle + 25, L.west - 25, L.middle - 45)
    .line(L.west - 25, L.north + 180).finish();
}

function lowerEastRoute(region) {
  const route = createRoute('lower-east').move(L.west + 25, L.middle + 100).line(L.west + 25, L.south - 50)
    .curve(L.west + 25, L.south - 25, L.west + 50, L.south - 25)
    .line(BRIDGE.approachWest - (region.bridge ? 22 : 0), L.south - 25).mark('bridge-west');
  if (region.bridge) route.line(BRIDGE.taperWest, L.south - 25)
    .curve(BRIDGE.from - 15, L.south, BRIDGE.from, L.south)
    .line(BRIDGE.to, L.south).curve(BRIDGE.to + 15, L.south, BRIDGE.taperEast, L.south - 25);
  else route.line(BRIDGE.to + 25, L.south - 25);
  return route.line(L.center - 50, L.south - 25).curve(L.center - 25, L.south - 25, L.center - 25, L.south - 50)
    .line(L.center - 25, L.middle + 115).mark('round-south')
    .line(...ringPoint(3.45)).arc(3.45, 4.4).mark('ring-exit')
    .line(L.center - 120, L.middle + 25)
    .line(L.west + 90, L.middle + 25).mark('west-middle-east').line(L.west + 50, L.middle + 25)
    .curve(L.west + 25, L.middle + 25, L.west + 25, L.middle + 70)
    .line(L.west + 25, L.middle + 100).finish();
}

function lowerWestRoute(region) {
  const route = createRoute('lower-west').move(L.west - 25, L.middle + 100)
    .line(L.west - 25, L.middle + 90).mark('west-middle-south').line(L.west - 25, L.middle + 50)
    .curve(L.west - 25, L.middle - 25, L.west + 50, L.middle - 25)
    .line(L.center - 115, L.middle - 25).mark('round-west')
    .line(...ringPoint(5.02)).arc(5.02, 9.12).mark('ring-exit')
    .line(L.center + 25, L.middle + 115).line(L.center + 25, L.south - 50)
    .curve(L.center + 25, L.south + 25, L.center - 50, L.south + 25)
    .line(BRIDGE.approachEast + (region.bridge ? 22 : 0), L.south + 25).mark('bridge-east');
  if (region.bridge) route.line(BRIDGE.taperEast, L.south + 25)
    .curve(BRIDGE.to + 15, L.south, BRIDGE.to, L.south)
    .line(BRIDGE.from, L.south).curve(BRIDGE.from - 15, L.south, BRIDGE.taperWest, L.south + 25);
  else route.line(BRIDGE.from - 20, L.south + 25);
  return route.line(L.west + 50, L.south + 25)
    .curve(L.west - 25, L.south + 25, L.west - 25, L.south - 50)
    .line(L.west - 25, L.middle + 100).finish();
}

// 东侧两条闭环分别提供主路双向来车，沿新增道路连续行驶。
function mainEastRoute(complex) {
  const t = COMPLEX_T;
  const route = createRoute('main-east').move(t.mainFrom, L.middle - 25);
  if (complex) route.line(t.mainFullFrom, t.eastboundLane).line(t.mainFullTo, t.eastboundLane);
  route.line(t.mainTo, L.middle - 25)
    .curve(L.east - 25, L.middle - 25, L.east - 25, L.middle - 75)
    .line(L.east - 25, L.north + 75)
    .curve(L.east - 25, L.north + 25, L.east - 75, L.north + 25)
    .line(L.center + 50, L.north + 25).mark('westbound')
    .curve(L.center + 25, L.north + 25, L.center + 25, L.north + 75)
    .line(L.center + 25, L.middle - 115).mark('round-north')
    .line(...ringPoint(.3)).arc(.3, 1.25).mark('ring-exit')
    .line(L.center + 115, L.middle - 25).line(t.mainFrom, L.middle - 25);
  return route.finish();
}

function mainWestRoute(complex) {
  const t = COMPLEX_T;
  const route = createRoute('main-west').move(t.mainTo, L.middle + 25);
  if (complex) route.line(t.mainFullTo, t.westboundLane).line(t.mainFullFrom, t.westboundLane);
  route.line(t.mainFrom, L.middle + 25).line(L.center + 115, L.middle + 25).mark('round-east')
    .line(...ringPoint(1.875)).arc(1.875, 3.0).mark('ring-exit')
    .line(L.center + 25, L.middle + 115).line(L.center + 25, L.south - 75)
    .curve(L.center + 25, L.south - 25, L.center + 100, L.south - 25)
    .line(L.east - 75, L.south - 25)
    .curve(L.east - 25, L.south - 25, L.east - 25, L.south - 75)
    .line(L.east - 25, L.middle + 75)
    .curve(L.east - 25, L.middle + 25, t.mainTo, L.middle + 25);
  return route.finish();
}

// 中央道路北端折返，形成真正穿过信号口的对向车流。
function signalOncomingRoute() {
  return createRoute('signal-oncoming').move(L.center + 25, L.north - 77)
    .line(L.center + 25, L.north - 50).mark('southbound')
    .line(L.center + 25, L.middle - 115).mark('round-north')
    .line(...ringPoint(.3)).arc(.3, 6.0).mark('ring-exit')
    .line(L.center - 25, L.middle - 115)
    .line(L.center - 25, L.north + 50).mark('northbound')
    .line(L.center - 25, L.north - 77)
    .turn(L.center, L.north - 77, 25, Math.PI, Math.PI * 2).finish();
}

const routesByRegion = new Map();

export function npcRoutes(region, complex = false) {
  const key = `${region.code}:${complex}`;
  if (!routesByRegion.has(key)) {
    const routes = [townRoute(complex), lowerEastRoute(region), lowerWestRoute(region), mainEastRoute(complex), mainWestRoute(complex), signalOncomingRoute()];
    for (const route of routes) {
      // 控制线以车头为准；路线标记存车身中心，预留 19 单位车长。
      for (const marker of route.markers) {
        if (SIGNAL_APPROACHES.some(item => item.id === marker.name)
          || ['stop-t', 'give-t'].includes(marker.name) || marker.name.startsWith('round-')) marker.at -= 19;
      }
      const entry = route.markers.find(marker => marker.name.startsWith('round-'));
      const exit = route.markers.find(marker => marker.name === 'ring-exit');
      route.roundabout = { entry: entry.at, exit: exit.at,
        entryArm: ringArm(sampleRoute(route, entry.at)), exitArm: ringArm(sampleRoute(route, exit.at + 80)) };
      route.turns = [];
      route.junctionPasses = [];
      for (const junction of JUNCTIONS.filter(item => item.type !== 'roundabout')) {
        let entryPoint = null;
        for (let at = 0; at < route.length; at += 5) {
          const point = sampleRoute(route, at), radius = distance(point, junction);
          if (!entryPoint && radius < 78) entryPoint = { at, point };
          if (entryPoint && radius > 82) {
            const turn = turnFrom(entryPoint.point.angle, point.angle);
            if (turn !== 'straight') route.turns.push({ start: entryPoint.at, end: at, turn });
            const path = [];
            for (let p = entryPoint.at; p <= at; p += 6) path.push(sampleRoute(route, p));
            route.junctionPasses.push({ junctionId: junction.id, start: entryPoint.at, end: at, turn, path, heading: headingFor(entryPoint.point.angle) });
            if (['north-east', 'south-middle', 'east-middle'].includes(junction.id)) {
              route.markers.push({ name: `junction:${junction.id}`, at: Math.max(0, entryPoint.at - 12) });
            }
            entryPoint = null;
          }
        }
      }
    }
    routesByRegion.set(key, routes);
  }
  return routesByRegion.get(key);
}

export function sampleRoute(route, progress) {
  const position = ((progress % route.length) + route.length) % route.length;
  let low = 0;
  let high = route.lengths.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (route.lengths[middle] <= position) low = middle;
    else high = middle;
  }
  const segmentLength = route.lengths[high] - route.lengths[low];
  const portion = segmentLength ? (position - route.lengths[low]) / segmentLength : 0;
  const first = route.points[low];
  const second = route.points[high];
  return { x: first.x + (second.x - first.x) * portion, y: first.y + (second.y - first.y) * portion,
    angle: Math.atan2(second.x - first.x, first.y - second.y) };
}

export function createNpcs(levelId, density, region) {
  const complex = levelId === 4 || levelId === 8;
  const routes = npcRoutes(region, complex);
  const entries = levelId === 2 || levelId === 3 ? [[0, .24]]
    : levelId === 4 ? [[0, .45], [3, .9], [4, .02], [0, .7]]
      : levelId === 5 ? [[5, 0], [0, .12]]
        : levelId === 8 ? [[0, .24], [3, .9], [4, .02], [1, .26], [2, .54], [5, .68]]
          : [[0, .24], [1, .26], [2, .54], [5, .68]];
  const spawned = [];
  const start = LEVELS.find(level => level.id === levelId).start;
  return (density === 'low' ? entries.slice(0, 2) : entries).map(([routeIndex, offset], index) => {
    const route = routes[routeIndex];
    let progress = route.length * offset;
    // 初始分布随路段长度变化，避开环岛及玩家，车辆开始后不再重置位置。
    for (let attempt = 0; attempt < Math.ceil(route.length / 60); attempt++) {
      const point = sampleRoute(route, progress);
      if (distance(point, WORLD.roundabout) >= WORLD.roundabout.outer + 20
        && distance(point, start) >= 55 && spawned.every(other => distance(point, other) >= 55)) break;
      progress = (progress + 60) % route.length;
    }
    spawned.push(sampleRoute(route, progress));
    return { id: index, route, progress, ...sampleRoute(route, progress), speed: 0,
      cruiseSpeed: 37 + index * 4, color: ['#d8e7cf', '#e2b482', '#b8cdb8', '#c4d1e0'][index],
      state: 'cruise', signal: null, clock: 0, stopTimer: 0, servedStop: null,
      giveTimer: 0, medianTimer: 0, servedGive: false, servedMedian: false, waiting: null };
  });
}

function nextMarker(npc) {
  let closest = null;
  for (const marker of npc.route.markers.filter(item => item.name !== 'ring-exit')) {
    const ahead = marker.at >= npc.progress ? marker.at - npc.progress : npc.route.length - npc.progress + marker.at;
    if (!closest || ahead < closest.ahead) closest = { ...marker, ahead };
  }
  return closest;
}

function bridgeOccupied(npc, others, player) {
  return others.some(other => other !== npc && (other.bridgeDirection || inBridgeCorridor(other)))
    || inBridgeCorridor(player);
}

function complexMainConflict(npc, others, player, stage = 'entry') {
  return complexTrafficConflict([...others.filter(other => other !== npc), player], stage);
}

function complexMedianOccupied(npc, others, player) {
  return others.some(vehicle => vehicle !== npc && inComplexMedian(vehicle)) || inComplexMedian(player);
}

function complexEntryReserved(npc, others, player) {
  // 车辆越过让行控制点即占用入口，避免后车在前车到达中央区之前抢先放行。
  return others.some(other => {
    if (other === npc) return false;
    const give = other.route.markers.find(marker => marker.name === 'complex-give');
    const median = other.route.markers.find(marker => marker.name === 'complex-median');
    return give && median && other.progress > give.at && other.progress < median.at;
  }) || Boolean(player) && player.x >= COMPLEX_T.branchDividerX && player.x < COMPLEX_T.branchLaneDividerX
    && player.y > COMPLEX_T.giveWayY && player.y < COMPLEX_T.y - COMPLEX_T.medianWidth / 2;
}

function blocked(npc, marker, others, player, delta, elapsed, region, pedestrians) {
  if (marker.name === 'pedestrian') return pedestriansHavePriority(pedestrians);
  if (marker.name.startsWith('junction:')) {
    const junction = JUNCTIONS.find(item => `junction:${item.id}` === marker.name);
    if (npc.reservation?.id === junction.id) return false;
    const occupied = others.some(other => other !== npc && (other.reservation?.id === junction.id || distance(other, junction) < 65)
      && movementsConflict(npc.movement, other.movement))
      || player && distance(player, junction) < 65;
    if (occupied || junctionConflict(npc, junction, [...others, player], region, npc.movement)) return true;
    if (marker.ahead < 6) npc.reservation = { id: junction.id, entered: false };
    return false;
  }
  if (marker.name.startsWith('west-middle-')) {
    const center = { x: L.west, y: L.middle };
    if (npc.junctionReservation) return false;
    const occupied = others.some(other => other !== npc
      && (other.junctionReservation || distance(other, center) < 85))
      || Boolean(player) && distance(player, center) < 85;
    if (!occupied && (region.code !== 'NZ' || !junctionConflict(npc, { ...center, id: 'west-middle' }, [...others, player], region, npc.movement)) && marker.ahead < 6) {
      npc.junctionReservation = true;
      npc.junctionEntered = false;
      return false;
    }
    return true;
  }
  const signal = SIGNAL_APPROACHES.find(approach => approach.id === marker.name);
  if (signal) {
    const turn = npc.movement.turn;
    if (signalMustStop(npc, signal, elapsed, region, turn, npc.signalMemory ||= {})) return true;
    return junctionConflict(npc, JUNCTIONS.find(item => item.id === 'signal'),
      [...others, player], region, npc.movement, elapsed);
  }
  if (marker.name === 'stop-t') {
    const control = CONTROL_POINTS.find(item => item.id === 'stop-t');
    const stopped = updateStop(npc.stopState ||= {}, npc, control, delta);
    if (stopped) npc.servedStop = 'stop-t';
    return !stopped || junctionConflict(npc, JUNCTIONS.find(item => item.id === 'stop-t'), [...others, player], region, npc.movement);
  }
  if (marker.name === 'complex-give') {
    if (npc.servedGive) return false;
    if (marker.ahead < 6 && npc.speed < 2 && !complexMainConflict(npc, others, player) && !complexMedianOccupied(npc, others, player)
      && !complexEntryReserved(npc, others, player)) {
      npc.giveTimer += delta;
      if (npc.giveTimer >= .55) {
        npc.servedGive = true;
        return false;
      }
    } else if (marker.ahead < 6) npc.giveTimer = 0;
    return true;
  }
  if (marker.name === 'complex-median') {
    if (npc.servedMedian) return false;
    const occupied = complexMedianOccupied(npc, others, player) || complexMainConflict(npc, others, player, 'exit');
    if (marker.ahead < 6 && npc.speed < 2 && !occupied) {
      npc.medianTimer += delta;
      if (npc.medianTimer >= .35) {
        npc.servedMedian = true;
        return false;
      }
    } else if (marker.ahead < 6) npc.medianTimer = 0;
    return true;
  }
  if (marker.name === 'bridge-west' || marker.name === 'bridge-east') {
    if (!region.bridge || npc.bridgeDirection) return false;
    if (bridgeOccupied(npc, others, player)) return true;
    if (marker.name === 'bridge-west') {
      const approaching = vehicle => vehicle && vehicle.x > BRIDGE.taperEast
        && vehicle.x < BRIDGE.approachEast + 75 && Math.abs(vehicle.y - BRIDGE.y) < 47
        && Math.sin(vehicle.angle) < -.5;
      if (others.some(other => other !== npc && approaching(other)) || approaching(player)) return true;
    }
    // 放行时预留完整引道，直到车尾离开另一端，避免两车在桥头抢入。
    if (marker.ahead < 6) npc.bridgeDirection = marker.name === 'bridge-west' ? 1 : -1;
    return false;
  }
  const control = CONTROL_POINTS.find(item => item.id === marker.name);
  if (!control) return false;
  if (marker.name === 'give-t') return junctionConflict(npc, JUNCTIONS.find(item => item.id === 'give-t'),
    [...others, player], region, npc.movement);
  return roundaboutConflict(npc, control, [...others, player]);
}

function upcomingSignal(npc) {
  if (npc.route.id === 'signal-oncoming' && npc.progress > npc.route.length - 123) return 'right';
  const plan = npc.route.roundabout;
  const ahead = (plan.entry - npc.progress + npc.route.length) % npc.route.length;
  if (ahead < Math.max(100, npc.cruiseSpeed * 3.2) || npc.progress >= plan.entry && npc.progress <= plan.exit + 55) {
    return roundaboutIndicator(plan.entryArm, plan.exitArm, npc, npc.progress >= plan.entry);
  }
  const turn = npc.route.turns.find(item => npc.progress >= item.start - Math.max(100, npc.cruiseSpeed * 3.2) && npc.progress <= item.end);
  return turn?.turn || null;
}

function plannedMovement(npc, junction) {
  const movement = junctionMovement(npc, junction);
  const pass = npc.route.junctionPasses.find(item => item.junctionId === junction.id && npc.progress >= item.start - 160 && npc.progress <= item.end);
  return { ...movement, junctionId: junction.id, turn: pass?.turn || 'straight', heading: pass?.heading ?? movement.heading, path: pass?.path };
}

export function updateNpcs(npcs, delta, elapsed, region, player, pedestrians = []) {
  for (const npc of npcs) {
    const junction = JUNCTIONS.filter(item => item.type !== 'roundabout')
      .find(item => distance(npc, item) < 210);
    npc.movement = junction ? plannedMovement(npc, junction) : null;
    npc.signal = upcomingSignal(npc);
  }
  for (const npc of npcs) {
    npc.clock = elapsed;
    if (npc.reservation) {
      const junction = JUNCTIONS.find(item => item.id === npc.reservation.id);
      const radius = distance(npc, junction);
      if (radius < 70) npc.reservation.entered = true;
      if (npc.reservation.entered && radius > 105) npc.reservation = null;
    }
    if (npc.bridgeDirection > 0 && npc.x > BRIDGE.taperEast + 24
      || npc.bridgeDirection < 0 && npc.x < BRIDGE.taperWest - 24) npc.bridgeDirection = 0;
    // 路口内部保留通行空间，防止三个不同转向的车在交叉处相互卡住。
    if (npc.junctionReservation) {
      const radius = distance(npc, { x: L.west, y: L.middle });
      if (radius < 85) npc.junctionEntered = true;
      if (npc.junctionEntered && radius > 110) npc.junctionReservation = false;
    }
    const marker = nextMarker(npc);
    const mustWait = marker && marker.ahead < 70 && blocked(npc, marker, npcs, player, delta, elapsed, region, pedestrians);
    const cruise = npc.route.id === 'signal-oncoming' && npc.y < L.north - 35 ? Math.min(15, npc.cruiseSpeed) : npc.cruiseSpeed;
    const targetSpeed = mustWait ? Math.min(npc.cruiseSpeed, Math.max(0, marker.ahead - 3) * 1.8) : cruise;
    npc.speed = clamp(npc.speed + clamp(targetSpeed - npc.speed, -90 * delta, 55 * delta), 0, npc.cruiseSpeed);
    if (mustWait && marker.ahead < 3.1 && npc.speed < .2) npc.speed = 0;
    let step = npc.speed * delta;
    if (mustWait) step = Math.min(step, Math.max(0, marker.ahead - 3));
    const next = sampleRoute(npc.route, npc.progress + step);
    const nearPlayer = player && distance(next, player) < 43;
    const nearNpc = npcs.some(other => other !== npc && distance(next, other) < 34
      && distance(next, other) < distance(npc, other) - .01);
    if (nearPlayer || nearNpc) {
      npc.speed = 0;
      npc.state = 'yield';
      continue;
    }
    if (marker?.name === 'stop-t' && npc.servedStop === 'stop-t' && step > marker.ahead) {
      npc.servedStop = null;
      npc.stopTimer = 0;
      npc.stopState = {};
    }
    if (marker?.name === 'complex-give' && npc.servedGive && step > marker.ahead) {
      npc.servedGive = false;
      npc.giveTimer = 0;
    }
    if (marker?.name === 'complex-median' && npc.servedMedian && step > marker.ahead) {
      npc.servedMedian = false;
      npc.medianTimer = 0;
    }
    npc.progress = (npc.progress + step) % npc.route.length;
    Object.assign(npc, next);
    npc.state = mustWait
      ? marker.name === 'complex-give' ? 'wait-give' : marker.name === 'complex-median' ? 'median-wait' : 'wait'
      : 'cruise';
    npc.waiting = mustWait ? marker.name : null;
    npc.signal = upcomingSignal(npc);
  }
}
