import { BRIDGE, CONTROL_POINTS, SIGNAL_APPROACHES, WORLD } from './data.js';
import { clamp, distance, signalForApproach } from './rules.js';

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
    arc(from, to) {
      const steps = Math.ceil((to - from) * 82 / 8);
      for (let step = 1; step <= steps; step += 1) {
        const angle = from + (to - from) * step / steps;
        add(560 + Math.sin(angle) * 82, 450 - Math.cos(angle) * 82);
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

function townRoute() {
  return createRoute('town').move(185, 360)
    .line(185, 230).mark('stop-t').line(185, 222)
    .curve(185, 155, 260, 155).line(510, 155).mark('eastbound').line(850, 155)
    .curve(925, 155, 925, 230).line(925, 402).mark('give-t').line(925, 410)
    .curve(925, 475, 850, 475).line(675, 475).mark('round-east')
    .line(560 + Math.sin(1.875) * 82, 450 - Math.cos(1.875) * 82)
    .arc(1.875, 4.4).mark('ring-exit').line(440, 475).line(235, 475)
    .curve(185, 475, 185, 405).line(185, 360).finish();
}

function lowerEastRoute(region) {
  const route = createRoute('lower-east').move(235, 520).line(235, 670)
    .curve(235, 695, 260, 695).line(BRIDGE.approachWest, 695).mark('bridge-west');
  if (region.bridge) route.curve(335, 695, 350, 720).line(410, 720).curve(425, 720, 450, 695);
  else route.line(450, 695);
  return route.line(510, 695).curve(535, 695, 535, 670)
    .line(535, 565).mark('round-south')
    .line(560 + Math.sin(3.45) * 82, 450 - Math.cos(3.45) * 82)
    .arc(3.45, 4.4).mark('ring-exit').line(440, 475).line(260, 475)
    .curve(235, 475, 235, 520).finish();
}

function lowerWestRoute(region) {
  const route = createRoute('lower-west').move(185, 520).line(185, 500)
    .curve(185, 425, 260, 425).line(445, 425).mark('round-west')
    .line(560 + Math.sin(5.02) * 82, 450 - Math.cos(5.02) * 82)
    .arc(5.02, 9.12).mark('ring-exit').line(585, 565).line(585, 670)
    .curve(585, 745, 510, 745).line(BRIDGE.approachEast, 745).mark('bridge-east');
  if (region.bridge) route.curve(425, 745, 410, 720).line(350, 720).curve(335, 720, 315, 745);
  else route.line(315, 745);
  return route.line(260, 745).curve(185, 745, 185, 670).line(185, 520).finish();
}

const routesByRegion = new Map();

export function npcRoutes(region) {
  if (!routesByRegion.has(region.code)) {
    routesByRegion.set(region.code, [townRoute(), lowerEastRoute(region), lowerWestRoute(region)]);
  }
  return routesByRegion.get(region.code);
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
  const routes = npcRoutes(region);
  const entries = levelId === 2 || levelId === 3 ? [[0, .24]]
    : levelId === 4 ? [[0, .33], [0, .68]]
      : levelId === 5 ? [[1, .72], [2, .15]]
        : [[0, .24], [1, .26], [2, .54], [0, .75]];
  return (density === 'low' ? entries.slice(0, 2) : entries).map(([routeIndex, offset], index) => {
    const route = routes[routeIndex];
    const progress = route.length * offset;
    return { id: index, route, progress, ...sampleRoute(route, progress), speed: 0,
      cruiseSpeed: 37 + index * 4, color: ['#d8e7cf', '#e2b482', '#b8cdb8', '#c4d1e0'][index],
      state: 'cruise', signal: null, clock: 0, stopTimer: 0, servedStop: null, waiting: null };
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
  const occupied = vehicle => vehicle !== npc && vehicle.x > BRIDGE.from - 5 && vehicle.x < BRIDGE.to + 5
    && Math.abs(vehicle.y - BRIDGE.y) < 32;
  return others.some(occupied) || occupied(player);
}

function blocked(npc, marker, others, player, delta, elapsed, region) {
  if (marker.name === 'eastbound') return signalForApproach(elapsed, region, SIGNAL_APPROACHES.find(approach => approach.id === marker.name)) !== 'green';
  if (marker.name === 'stop-t') {
    if (npc.servedStop === 'stop-t') return false;
    if (marker.ahead < 5 && npc.speed < 2) {
      npc.stopTimer += delta;
      if (npc.stopTimer >= .8) { npc.servedStop = 'stop-t'; return false; }
    }
    return true;
  }
  if (marker.name === 'bridge-west' || marker.name === 'bridge-east') {
    if (!region.bridge) return false;
    if (bridgeOccupied(npc, others, player)) return true;
    if (marker.name === 'bridge-west') {
      return others.some(other => other.route.id === 'lower-west' && other.x > BRIDGE.to && other.x < BRIDGE.to + 100
        && Math.abs(other.y - BRIDGE.y) < 70)
        || player.x > BRIDGE.to && player.x < BRIDGE.to + 100 && Math.abs(player.y - BRIDGE.y) < 70;
    }
    return false;
  }
  const control = CONTROL_POINTS.find(item => item.id === marker.name);
  if (!control) return false;
  const center = marker.name === 'give-t' ? { x: 900, y: 450 } : WORLD.roundabout;
  const radius = marker.name === 'give-t' ? 85 : 110;
  const conflict = vehicle => vehicle !== npc && distance(vehicle, center) < radius
    && (marker.name === 'give-t' || distance(vehicle, WORLD.roundabout) > WORLD.roundabout.inner);
  return others.some(conflict) || conflict(player);
}

function upcomingSignal(npc) {
  if (distance(npc, WORLD.roundabout) < 120) {
    const exit = npc.route.markers.find(marker => marker.name === 'ring-exit');
    if (!exit) return null;
    const ahead = exit.at >= npc.progress ? exit.at - npc.progress : npc.route.length - npc.progress + exit.at;
    return ahead < 75 ? 'left' : null;
  }
  const next = sampleRoute(npc.route, npc.progress + 38);
  const change = Math.atan2(Math.sin(next.angle - npc.angle), Math.cos(next.angle - npc.angle));
  return Math.abs(change) > .36 ? change > 0 ? 'right' : 'left' : null;
}

export function updateNpcs(npcs, delta, elapsed, region, player) {
  for (const npc of npcs) {
    npc.clock = elapsed;
    const marker = nextMarker(npc);
    const mustWait = marker && marker.ahead < 70 && blocked(npc, marker, npcs, player, delta, elapsed, region);
    const targetSpeed = mustWait ? Math.min(npc.cruiseSpeed, Math.max(0, marker.ahead - 3) * 1.8) : npc.cruiseSpeed;
    npc.speed = clamp(npc.speed + clamp(targetSpeed - npc.speed, -90 * delta, 55 * delta), 0, npc.cruiseSpeed);
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
    }
    npc.progress = (npc.progress + step) % npc.route.length;
    Object.assign(npc, next);
    npc.state = mustWait ? 'wait' : 'cruise';
    npc.waiting = mustWait ? marker.name : null;
    npc.signal = upcomingSignal(npc);
  }
}
