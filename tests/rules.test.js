import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS } from '../src/data.js';
import { crossed, isOnRoad, lightState, steeringStep, wrongSide } from '../src/rules.js';

test('新西兰灯号没有英国红黄同亮阶段', () => {
  assert.equal(lightState(19.5, REGIONS.nz), 'red');
  assert.equal(lightState(19.5, REGIONS.uk), 'redAmber');
  assert.equal(lightState(4, REGIONS.nz), 'green');
  assert.equal(lightState(10, REGIONS.nz), 'amber');
});

test('左右车道根据行驶方向判定', () => {
  assert.equal(wrongSide({ x: 185, y: 590 }, 0), false);
  assert.equal(wrongSide({ x: 235, y: 590 }, 0), true);
  assert.equal(wrongSide({ x: 235, y: 590 }, Math.PI), false);
  assert.equal(wrongSide({ x: 185, y: 590 }, Math.PI), true);
});

test('路面包含直路和环岛，不包含中心岛', () => {
  assert.equal(isOnRoad({ x: 185, y: 590 }), true);
  assert.equal(isOnRoad({ x: 560, y: 370 }), true);
  assert.equal(isOnRoad({ x: 560, y: 450 }), false);
  assert.equal(isOnRoad({ x: 20, y: 20 }), false);
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
