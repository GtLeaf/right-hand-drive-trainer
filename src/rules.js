import { BRIDGE, JUNCTIONS, ROADS, SIGNAL_APPROACHES, WORLD } from './data.js';

export const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function lightState(time, region, horizontal = false) {
  const phase = ((time % 23) + 23) % 23;
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

export function isOnRoad(position, region) {
  const roundabout = WORLD.roundabout;
  const radius = distance(position, roundabout);
  if (radius >= roundabout.inner && radius <= roundabout.outer) return true;
  if (radius < roundabout.inner) return false;
  if (region?.bridge && position.x >= BRIDGE.from && position.x <= BRIDGE.to
    && Math.abs(position.y - BRIDGE.y) <= 50
    && Math.abs(position.y - BRIDGE.y) > BRIDGE.narrowWidth / 2) return false;
  return ROADS.some(road => road.axis === 'v'
    ? Math.abs(position.x - road.center) <= road.width / 2 && position.y >= road.from && position.y <= road.to
    : Math.abs(position.y - road.center) <= road.width / 2 && position.x >= road.from && position.x <= road.to);
}

export function wrongSide(position, angle) {
  if (distance(position, WORLD.roundabout) < 125) return false;
  if (JUNCTIONS.some(junction => distance(position, junction) < junction.radius + 24)) return false;
  if (position.x > BRIDGE.approachWest && position.x < BRIDGE.approachEast && Math.abs(position.y - BRIDGE.y) < 50) return false;
  const vertical = ROADS.find(road => road.axis === 'v' && Math.abs(position.x - road.center) < 38 && position.y > road.from + 50 && position.y < road.to - 50);
  if (vertical && Math.abs(Math.cos(angle)) > .7 && Math.abs(position.x - vertical.center) > 9) {
    return Math.cos(angle) > 0 ? position.x > vertical.center : position.x < vertical.center;
  }
  const horizontal = ROADS.find(road => road.axis === 'h' && Math.abs(position.y - road.center) < 38 && position.x > road.from + 50 && position.x < road.to - 50);
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
