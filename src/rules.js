import { ROADS, WORLD } from './data.js';

export const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function lightState(time, region, horizontal = false) {
  const phase = ((time % 20) + 20) % 20;
  const vertical = phase < 9 ? 'green' : phase < 11 ? 'amber' : phase < 19 ? 'red' : region.redAmber ? 'redAmber' : 'red';
  if (!horizontal) return vertical;
  return phase >= 11 && phase < 19 ? 'green' : phase >= 19 ? 'amber' : 'red';
}

export function isOnRoad(position) {
  const roundabout = WORLD.roundabout;
  const radius = distance(position, roundabout);
  if (radius >= roundabout.inner && radius <= roundabout.outer) return true;
  if (radius < roundabout.inner) return false;
  return ROADS.some(road => road.axis === 'v'
    ? Math.abs(position.x - road.center) <= road.width / 2 && position.y >= road.from && position.y <= road.to
    : Math.abs(position.y - road.center) <= road.width / 2 && position.x >= road.from && position.x <= road.to);
}

export function wrongSide(position, angle) {
  if (distance(position, WORLD.roundabout) < 125) return false;
  const nearJunction = [180, 450, 720].some(y => Math.abs(position.y - y) < 72)
    && [210, 560, 900].some(x => Math.abs(position.x - x) < 72);
  if (nearJunction) return false;
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

export function crossed(previous, current, axis, value, direction) {
  return direction > 0 ? previous[axis] < value && current[axis] >= value : previous[axis] > value && current[axis] <= value;
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
