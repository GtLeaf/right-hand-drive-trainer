import { BRIDGE, bridgeHalfWidth, COMPLEX_ROAD_POLYGONS, COMPLEX_T, complexBranchSection, CROSSING, JUNCTIONS, ROADS, SIGNAL_APPROACHES, WORLD } from './data.js';

export const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function lightState(time, region, horizontal = false) {
  const cycle = region.code === 'NZ' ? 37 : 23;
  const phase = ((time % cycle) + cycle) % cycle;
  if (phase >= 23) return 'red';
  if (!horizontal) return phase < 8 ? 'green' : phase < 10 ? 'amber' : phase >= 22 && region.redAmber ? 'redAmber' : 'red';
  return phase < 11 ? 'red' : phase < 12 && region.redAmber ? 'redAmber' : phase < 12 ? 'red' : phase < 19 ? 'green' : phase < 21 ? 'amber' : 'red';
}

export function signalForApproach(time, region, approach) {
  return lightState(time, region, approach.axis === 'x');
}

export function crossed(previous, current, axis, value, direction) {
  return direction > 0 ? previous[axis] < value && current[axis] >= value : previous[axis] > value && current[axis] <= value;
}

export function crossesControl(previous, current, control) {
  const lateral = current[control.laneAxis];
  const heading = control.axis === 'y' ? -Math.cos(current.angle) : Math.sin(current.angle);
  return lateral >= control.laneMin && lateral <= control.laneMax
    && heading * control.direction > .55
    && crossed(previous, current, control.axis, control.position ?? control[control.axis], control.direction);
}

export function signalApproachForCar(car) {
  return SIGNAL_APPROACHES.find(approach => {
    const lateral = car[approach.laneAxis];
    const ahead = (approach.position - car[approach.axis]) * approach.direction;
    const heading = approach.axis === 'y' ? -Math.cos(car.angle) : Math.sin(car.angle);
    return lateral >= approach.laneMin - 5 && lateral <= approach.laneMax + 5
      && heading * approach.direction > .65 && ahead >= -8 && ahead < 150;
  });
}

export function pointInPolygon(position, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    const cross = (position.x - ax) * (by - ay) - (position.y - ay) * (bx - ax);
    if (Math.abs(cross) < .001 && position.x >= Math.min(ax, bx) && position.x <= Math.max(ax, bx)
      && position.y >= Math.min(ay, by) && position.y <= Math.max(ay, by)) return true;
    if ((ay > position.y) !== (by > position.y)
      && position.x < (bx - ax) * (position.y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function inComplexMedian(vehicle) {
  return Boolean(vehicle) && vehicle.x >= COMPLEX_T.medianWaitMinX && vehicle.x <= COMPLEX_T.medianWaitMaxX
    && Math.abs(vehicle.y - COMPLEX_T.y) <= COMPLEX_T.medianWidth / 2;
}

export function onComplexMain(vehicle) {
  return Boolean(vehicle) && Math.abs(Math.sin(vehicle.angle)) > .7
    && (Math.abs(vehicle.y - COMPLEX_T.eastboundLane) < 22 || Math.abs(vehicle.y - COMPLEX_T.westboundLane) < 22)
    && vehicle.x >= COMPLEX_T.mainFrom && vehicle.x <= COMPLEX_T.mainTo;
}

export function inBridgeCorridor(vehicle) {
  return Boolean(vehicle) && vehicle.x > BRIDGE.approachWest && vehicle.x < BRIDGE.approachEast
    && Math.abs(vehicle.y - BRIDGE.y) < 47;
}

export function isOnRoad(position, region, complex = false) {
  const roundabout = WORLD.roundabout;
  const radius = distance(position, roundabout);
  if (radius >= roundabout.inner && radius <= roundabout.outer) return true;
  if (radius < roundabout.inner) return false;
  if (complex && COMPLEX_ROAD_POLYGONS.some(points => pointInPolygon(position, points))) return true;
  if (region?.bridge && position.x >= BRIDGE.taperWest && position.x <= BRIDGE.taperEast
    && Math.abs(position.y - BRIDGE.y) <= 60) return Math.abs(position.y - BRIDGE.y) <= bridgeHalfWidth(position.x);
  return ROADS.some(road => road.axis === 'v'
    ? Math.abs(position.x - road.center) <= road.width / 2 && position.y >= road.from && position.y <= road.to
    : Math.abs(position.y - road.center) <= road.width / 2 && position.x >= road.from && position.x <= road.to);
}

export function wrongSide(position, angle, complex = false, region) {
  if (distance(position, WORLD.roundabout) < 125) return false;
  if (JUNCTIONS.some(junction => !(complex && junction.id === 'give-t') && distance(position, junction) < junction.radius + 12)) return false;
  if (region?.bridge !== false && position.x > BRIDGE.approachWest && position.x < BRIDGE.approachEast && Math.abs(position.y - BRIDGE.y) < 50) return false;
  if (complex) {
    const t = COMPLEX_T;
    // 路口内部和中央转弯区允许转向；驶入车道仍按明确的方向检查。
    const inJunction = position.x >= t.branchWestEdge - t.cornerRadius
      && position.x <= t.branchEastEdge + t.cornerRadius
      && position.y >= t.giveWayY && position.y <= t.y + t.mainWidth / 2;
    const inTurnBay = position.x >= t.turnBayFrom && position.x <= t.medianTo
      && Math.abs(position.y - t.y) <= t.medianWidth / 2;
    if (inJunction || inTurnBay) return false;
    if (position.y >= t.branchTaperFrom && position.y < t.giveWayY) {
      const section = complexBranchSection(position.y);
      if (position.x >= section.west && position.x <= section.east && Math.abs(Math.cos(angle)) > .7) {
        return Math.cos(angle) > 0 ? position.x > section.divider + 4 : position.x < section.divider - 4;
      }
    }
    if (position.x >= t.mainFrom && position.x <= t.mainTo
      && Math.abs(position.y - t.y) <= t.mainWidth / 2 && Math.abs(Math.sin(angle)) > .7) {
      return Math.sin(angle) > 0 ? position.y > t.y + 5 : position.y < t.y - 5;
    }
  }
  const vertical = ROADS.find(road => road.axis === 'v' && Math.abs(position.x - road.center) < 47 && position.y > road.from + 50 && position.y < road.to - 50);
  if (vertical && Math.abs(Math.cos(angle)) > .7 && Math.abs(position.x - vertical.center) > 9) {
    return Math.cos(angle) > 0 ? position.x > vertical.center : position.x < vertical.center;
  }
  const horizontal = ROADS.find(road => road.axis === 'h' && Math.abs(position.y - road.center) < 47 && position.x > road.from + 50 && position.x < road.to - 50);
  if (horizontal && Math.abs(Math.sin(angle)) > .7 && Math.abs(position.y - horizontal.center) > 9) {
    return Math.sin(angle) > 0 ? position.y > horizontal.center : position.y < horizontal.center;
  }
  return false;
}

export function nearbyNpc(npcs, point, radius) {
  return npcs.some(npc => distance(npc, point) < radius);
}

export function steeringStep(car, input, delta) {
  const acceleration = input.throttle ? 92 : 0;
  const braking = input.brake ? 190 : 0;
  car.speed = clamp(car.speed + (acceleration - braking - 24) * delta, 0, 135);
  const turnFactor = clamp(car.speed / 85, .12, 1);
  car.angle += input.steer * 1.75 * turnFactor * delta;
  car.x += Math.sin(car.angle) * car.speed * delta;
  car.y -= Math.cos(car.angle) * car.speed * delta;
  car.x = clamp(car.x, 0, WORLD.width);
  car.y = clamp(car.y, 0, WORLD.height);
}

// 玩家和 NPC 共用车头、停车、灯号和路权判断；地图单位与车辆运动模型一致。
export const CAR_HALF_LENGTH = 19;
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const headingFor = angle => Math.round(angle / (Math.PI / 2)) * Math.PI / 2;
export const turnFrom = (from, to) => Math.abs(angleDelta(from, to)) < .55 ? 'straight' : angleDelta(from, to) > 0 ? 'right' : 'left';
export const frontPoint = car => ({ ...car, x: car.x + Math.sin(car.angle) * CAR_HALF_LENGTH,
  y: car.y - Math.cos(car.angle) * CAR_HALF_LENGTH });
export const crossesFront = (previous, current, control) => crossesControl(frontPoint(previous), frontPoint(current), control);
export const controlDistance = (car, control) => ((control.position ?? control[control.axis]) - frontPoint(car)[control.axis]) * control.direction;

export function updateStop(state, car, control, delta) {
  const ahead = controlDistance(car, control);
  const lateral = car[control.laneAxis];
  const facing = control.axis === 'x' ? Math.sin(car.angle) * control.direction : -Math.cos(car.angle) * control.direction;
  if (ahead > 65 || ahead < -30 || lateral < control.laneMin || lateral > control.laneMax || facing < .8) {
    state.stopped = false; state.dwell = 0;
  } else if (!state.stopped) {
    // 0.25 秒仅过滤单帧抖动，不作为交规要求的固定停车秒数。
    state.dwell = ahead >= 0 && ahead <= 12 && Math.abs(car.speed) <= .1 ? (state.dwell || 0) + delta : 0;
    if (state.dwell >= .25) state.stopped = true;
  }
  return Boolean(state.stopped);
}

export function rightArrowState(time, region, approach) {
  if (region.code !== 'NZ') return 'off';
  const phase = ((time % 37) + 37) % 37;
  const start = approach.axis === 'y' ? 23 : 30;
  if (phase >= start && phase < start + 3) return 'green';
  if (phase >= start + 3 && phase < start + 4) return 'amber';
  const circle = signalForApproach(time, region, approach);
  const greenStart = approach.axis === 'y' ? 0 : 12;
  if (circle === 'green' && phase >= greenStart + 3) return 'off';
  if (circle === 'amber') return 'off';
  return 'red';
}

export function movementSignal(time, region, approach, turn = 'straight') {
  const arrow = rightArrowState(time, region, approach);
  return turn === 'right' && arrow !== 'off' ? arrow : signalForApproach(time, region, approach);
}

export function signalMustStop(car, approach, time, region, turn, memory) {
  const state = movementSignal(time, region, approach, turn);
  const key = `${approach.id}:${turn}:${Math.floor(time / (region.code === 'NZ' ? 37 : 23))}:${rightArrowState(time, region, approach) === 'amber' ? 'arrow' : 'circle'}`;
  const ahead = controlDistance(car, approach);
  // 记录黄灯出现时能否安全停车，不能在越线时仅按速度猜测。
  if (state === 'amber') {
    if (memory.key !== key || memory.state !== 'amber' || time - (memory.updatedAt ?? time) > 1) {
      memory.stopOnAmber = ahead >= Math.max(0, car.speed) * .65 + car.speed ** 2 / (2 * 214) + 2;
    }
  } else memory.stopOnAmber = false;
  memory.key = key; memory.state = state; memory.updatedAt = time;
  return state === 'red' || state === 'redAmber' || state === 'amber' && memory.stopOnAmber;
}

export function junctionMovement(car, junction, turn = car.signal || 'straight') {
  const dx = car.x - junction.x, dy = car.y - junction.y;
  const heading = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? -Math.PI / 2 : Math.PI / 2 : dy > 0 ? 0 : Math.PI;
  const forward = { x: Math.sin(heading), y: -Math.cos(heading) };
  const toward = Math.sin(car.angle) * forward.x - Math.cos(car.angle) * forward.y;
  return { heading, turn, approaching: toward > .45, ahead: -(dx * forward.x + dy * forward.y) };
}

const pathConflicts = new WeakMap();
export function movementsConflict(first, second) {
  // NPC 使用其真实道路轨迹；不相交的转向可同时通行，避免相邻窄桥与路口互锁。
  if (!first?.path || !second?.path) return true;
  let cached = pathConflicts.get(first.path);
  if (!cached) { cached = new WeakMap(); pathConflicts.set(first.path, cached); }
  if (!cached.has(second.path)) cached.set(second.path,
    first.path.some(a => second.path.some(b => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 32 ** 2)));
  return cached.get(second.path);
}

export function junctionConflict(car, junction, others, region, movement = junctionMovement(car, junction), time = 0) {
  const own = movement;
  const ownMinor = (['stop-t', 'give-t'].includes(junction.id) && Math.abs(Math.cos(own.heading)) > .7)
    || junction.id === 'east-middle' && Math.abs(Math.sin(own.heading)) > .7;
  return others.some(other => {
    if (!other || other === car || !Number.isFinite(other.angle)) return false;
    const r = distance(other, junction);
    if (r > Math.max(105, (other.speed || 0) * 3 + 35)) return false;
    const next = other.movement?.junctionId === junction.id ? other.movement : junctionMovement(other, junction);
    if (!next.approaching && r > 58) return false;
    if (junction.id === 'signal' && r > 72) {
      const approach = SIGNAL_APPROACHES.find(item => Math.abs(angleDelta(item.heading, next.heading)) < .2);
      if (approach && ['red', 'redAmber'].includes(movementSignal(time, region, approach, next.turn))) return false;
    }
    if (!movementsConflict(own, next)) return false;
    const relative = angleDelta(own.heading, next.heading);
    if (Math.abs(relative) < .5) return false;
    const opposite = Math.abs(relative) > 2.6;
    const otherMinor = (['stop-t', 'give-t'].includes(junction.id) && Math.abs(Math.cos(next.heading)) > .7)
      || junction.id === 'east-middle' && Math.abs(Math.sin(next.heading)) > .7;
    if (ownMinor !== otherMinor) return ownMinor;
    if (opposite) return own.turn === 'right' && next.turn !== 'right';
    if (r < 55) return true;
    // NZ 无信号十字口：转弯让直行，然后按右侧来车规则。
    if (own.turn !== 'straight' && next.turn === 'straight') return true;
    if (own.turn === 'straight' && next.turn !== 'straight') return false;
    const rightX = Math.cos(own.heading), rightY = Math.sin(own.heading);
    if (region.code === 'NZ') return (other.x - junction.x) * rightX + (other.y - junction.y) * rightY > 0;
    // 英国无标志路口不套用 NZ 右侧优先；NPC 在同级冲突时确定性地相互礼让。
    return Number.isFinite(car.id) && Number.isFinite(other.id) ? other.id < car.id : true;
  });
}

const tau = Math.PI * 2;
export const clockwiseDistance = (from, to) => ((to - from) % tau + tau) % tau;
export const ringAngle = car => Math.atan2(car.x - WORLD.roundabout.x, WORLD.roundabout.y - car.y);
export const ringArm = car => headingFor(ringAngle(car));
export function roundaboutTurn(entry, exit) {
  const travel = clockwiseDistance(entry, exit);
  return travel < .2 || travel > Math.PI + .2 ? 'right' : travel < Math.PI - .2 ? 'left' : 'straight';
}
export function roundaboutIndicator(entry, exit, position, onRing) {
  const turn = roundaboutTurn(entry, exit);
  if (!onRing) return turn === 'straight' ? null : turn;
  const travel = clockwiseDistance(entry, exit) || tau;
  const progress = clockwiseDistance(entry, ringAngle(position));
  return progress >= travel - Math.PI / 2 ? 'left' : turn === 'right' ? 'right' : null;
}
export function roundaboutConflict(car, control, vehicles) {
  const entry = ringAngle(control);
  return vehicles.some(other => {
    if (!other || other === car) return false;
    const radius = distance(other, WORLD.roundabout);
    if (radius < WORLD.roundabout.inner || radius > WORLD.roundabout.outer + 8) return false;
    const behind = clockwiseDistance(ringAngle(other), entry);
    // 检查从右侧即将经过入口的环内车辆，出口方向不同的远车不阻塞整个环岛。
    return behind < 1.35 || distance(other, control) < 46;
  });
}

export function crossingControl(car) {
  if (Math.abs(car.y - CROSSING.y) > 48 || Math.abs(Math.sin(car.angle)) < .7) return null;
  const direction = Math.sin(car.angle) > 0 ? 1 : -1;
  return { id: 'pedestrian', axis: 'x', direction, position: direction > 0 ? CROSSING.x - 8 : CROSSING.x + CROSSING.width + 8,
    laneAxis: 'y', laneMin: CROSSING.y - 47, laneMax: CROSSING.y + 47 };
}
export function pedestriansHavePriority(pedestrians) {
  return pedestrians.some(person => person.state === 'waiting' || person.state === 'crossing');
}
export function pedestrianCollision(car, person) {
  if (person.state !== 'crossing') return false;
  const dx = person.x - car.x, dy = person.y - car.y;
  return Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) < 16
    && Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle)) < 24;
}
export function createPedestrians() {
  return [-1, 1].map((side, index) => ({ id: index, x: CROSSING.x + 17 + index * 23,
    y: CROSSING.y + side * 59, side, state: 'rest', timer: index ? 16 : 4, speed: 15 + index * 2 }));
}
export function updatePedestrians(pedestrians, delta, vehicles) {
  for (const person of pedestrians) {
    if (person.state === 'rest') {
      person.timer -= delta;
      if (person.timer <= 0) person.state = 'waiting';
    }
    if (person.state === 'waiting') {
      const safe = vehicles.every(car => {
        const control = crossingControl(car);
        if (!control) return true;
        const ahead = controlDistance(car, control);
        const tailPast = control.direction > 0 ? car.x - 19 > CROSSING.x + CROSSING.width : car.x + 19 < CROSSING.x;
        if (tailPast) return true;
        if (ahead < 0) return false;
        return car.speed <= .1 || ahead / Math.max(car.speed, .1) > 118 / person.speed + 1;
      });
      if (safe) person.state = 'crossing';
    }
    if (person.state === 'crossing') {
      person.y -= person.side * person.speed * delta;
      if ((person.y - CROSSING.y) * person.side <= -59) {
        person.side *= -1; person.y = CROSSING.y + person.side * 59;
        person.state = 'rest'; person.timer = 18 + person.id * 5;
      }
    }
  }
}

export function recordIndicator(car, time) {
  if (car.observedSignal !== car.signal) {
    car.observedSignal = car.signal;
    car.signalSince = time;
  }
}

export function roundaboutEvents(state, previous, car, time, region) {
  const events = [];
  const radius = distance(car, WORLD.roundabout);
  const before = distance(previous, WORLD.roundabout);
  const toward = (WORLD.roundabout.x - car.x) * Math.sin(car.angle) - (WORLD.roundabout.y - car.y) * Math.cos(car.angle);
  if (!state.active && radius > 125 && radius < 180 && toward > 0) {
    state.active = { arm: ringArm(car), entered: false, leftProgress: null };
  }
  const visit = state.active;
  if (!visit) return events;
  if (!visit.entered && radius <= 134) {
    visit.entered = true; visit.signal = car.signal; visit.signalLead = time - (car.signalSince ?? time);
  }
  if (visit.entered && car.signal === 'left' && visit.leftProgress === null) visit.leftProgress = clockwiseDistance(visit.arm, ringAngle(car));
  if (car.signal !== 'left') visit.leftProgress = null;
  if (radius < 113 && before < 113 && car.speed > .5 && angleDelta(ringAngle(previous), ringAngle(car)) < -.00001
    && Math.cos(car.angle - ringAngle(car) - Math.PI / 2) < -.5) events.push('round-wrong-way');
  if (visit.entered && radius > 134 && before <= 134 && toward < 0) {
    const exit = ringArm(car), turn = roundaboutTurn(visit.arm, exit);
    const expected = turn === 'straight' ? null : turn;
    if (visit.signal !== expected) events.push('round-entry-signal');
    else if (expected && region.code === 'NZ' && visit.signalLead < 3) events.push('round-entry-late');
    const travel = clockwiseDistance(visit.arm, exit) || tau;
    if (car.signal !== 'left' || visit.leftProgress === null || time - (car.signalSince ?? time) < .1) events.push('exit-signal');
    else if (turn !== 'left' && visit.leftProgress < travel - Math.PI / 2 - .25) events.push('round-exit-early');
    state.active = null;
  } else if (radius > 190) state.active = null;
  return events;
}

export function complexTrafficConflict(vehicles, stage = 'entry') {
  const direction = stage === 'entry' ? 1 : -1;
  const mergeX = stage === 'entry' ? COMPLEX_T.x : COMPLEX_T.x - 140;
  return vehicles.some(vehicle => {
    if (!vehicle || !onComplexMain(vehicle) || Math.sin(vehicle.angle) * direction < .7) return false;
    const ahead = (mergeX - vehicle.x) * direction;
    return ahead > -40 && ahead < Math.max(100, (vehicle.speed || 0) * 3 + 35);
  });
}
