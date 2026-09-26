export const WORLD = { width: 1100, height: 880, roundabout: { x: 560, y: 450, inner: 51, outer: 113 } };

export const ROADS = [
  { axis: 'v', center: 210, from: 180, to: 810, width: 94 },
  { axis: 'v', center: 560, from: 70, to: 810, width: 94 },
  { axis: 'v', center: 900, from: 70, to: 450, width: 94 },
  { axis: 'h', center: 180, from: 70, to: 1030, width: 94 },
  { axis: 'h', center: 450, from: 70, to: 1030, width: 94 },
  { axis: 'h', center: 720, from: 70, to: 1030, width: 94 }
];

export const JUNCTIONS = [
  { id: 'stop-t', x: 210, y: 180, type: 't', radius: 48 },
  { id: 'signal', x: 560, y: 180, type: 'signal', radius: 48 },
  { id: 'north-east', x: 900, y: 180, type: 'cross', radius: 48 },
  { id: 'west-middle', x: 210, y: 450, type: 'cross', radius: 48 },
  { id: 'roundabout', x: 560, y: 450, type: 'roundabout', radius: 117 },
  { id: 'give-t', x: 900, y: 450, type: 't', radius: 48 },
  { id: 'west-south', x: 210, y: 720, type: 'cross', radius: 48 },
  { id: 'south-middle', x: 560, y: 720, type: 'cross', radius: 48 }
];

export const BRIDGE = { from: 335, to: 425, approachWest: 315, approachEast: 445, y: 720, narrowWidth: 44 };

export const SIGNAL_APPROACHES = [
  { id: 'northbound', axis: 'y', direction: -1, position: 230, laneMin: 513, laneMax: 559, laneAxis: 'x', lightX: 497, lightY: 234, heading: 0, name: '北向' },
  { id: 'southbound', axis: 'y', direction: 1, position: 130, laneMin: 561, laneMax: 607, laneAxis: 'x', lightX: 623, lightY: 126, heading: Math.PI, name: '南向' },
  { id: 'eastbound', axis: 'x', direction: 1, position: 510, laneMin: 133, laneMax: 179, laneAxis: 'y', lightX: 505, lightY: 119, heading: Math.PI / 2, name: '东向' },
  { id: 'westbound', axis: 'x', direction: -1, position: 610, laneMin: 181, laneMax: 227, laneAxis: 'y', lightX: 615, lightY: 241, heading: -Math.PI / 2, name: '西向' }
];

export const CONTROL_POINTS = [
  { id: 'stop-t', type: 'stop', x: 185, y: 230, axis: 'y', direction: -1, laneMin: 163, laneMax: 210, laneAxis: 'x' },
  { id: 'give-t', type: 'give', x: 925, y: 402, axis: 'y', direction: 1, laneMin: 900, laneMax: 947, laneAxis: 'x' },
  { id: 'bridge-west', type: 'bridge-give', x: BRIDGE.approachWest, y: 695, axis: 'x', direction: 1, laneMin: 673, laneMax: 718, laneAxis: 'y' },
  { id: 'bridge-east', type: 'bridge-priority', x: BRIDGE.approachEast, y: 745, axis: 'x', direction: -1, laneMin: 722, laneMax: 767, laneAxis: 'y' },
  { id: 'round-south', type: 'round-give', x: 535, y: 565, axis: 'y', direction: -1, laneMin: 513, laneMax: 559, laneAxis: 'x' },
  { id: 'round-north', type: 'round-give', x: 585, y: 335, axis: 'y', direction: 1, laneMin: 561, laneMax: 607, laneAxis: 'x' },
  { id: 'round-west', type: 'round-give', x: 445, y: 425, axis: 'x', direction: 1, laneMin: 403, laneMax: 449, laneAxis: 'y' },
  { id: 'round-east', type: 'round-give', x: 675, y: 475, axis: 'x', direction: -1, laneMin: 451, laneMax: 497, laneAxis: 'y' }
];

export const REGIONS = {
  nz: { name: '新西兰', code: 'NZ', tag: 'NEW ZEALAND · ROAD CODE', stopLine: '#e6b84e', giveLine: '#f5f1dd', redAmber: false, bridge: true },
  uk: { name: '英国', code: 'UK', tag: 'UNITED KINGDOM · HIGHWAY CODE', stopLine: '#f5f1dd', giveLine: '#f5f1dd', redAmber: true, bridge: false }
};

export const LEVELS = [
  { id: 1, title: '左侧起步', subtitle: '找到正确车道，熟悉双拇指操作', hint: '沿左侧车道向前行驶', start: { x: 185, y: 650, angle: 0 }, checkpoints: [{ x: 185, y: 500 }, { x: 185, y: 315 }] },
  { id: 2, title: 'T 型左转', subtitle: 'STOP · 停稳观察后左转', hint: '在 STOP 线前停稳，左转驶入左侧车道', start: { x: 185, y: 360, angle: 0 }, checkpoints: [{ x: 185, y: 300 }, { x: 115, y: 205 }] },
  { id: 3, title: 'T 型右转', subtitle: 'GIVE WAY · 等待安全间隙', hint: '在东侧 T 字口让行后右转', start: { x: 925, y: 285, angle: Math.PI }, checkpoints: [{ x: 925, y: 325 }, { x: 925, y: 430 }, { x: 780, y: 475 }] },
  { id: 4, title: '信号十字路口', subtitle: '看灯色、停止线与对向车辆', hint: '按灯号通行，先右转再左转', start: { x: 535, y: 310, angle: 0 }, checkpoints: [{ x: 535, y: 265 }, { x: 730, y: 155 }, { x: 875, y: 112 }] },
  { id: 5, title: '单车道环岛', subtitle: '入口让行 · 出口提前打左灯', hint: '让行后绕过中心岛，驶向右侧出口', start: { x: 535, y: 650, angle: 0 }, checkpoints: [{ x: 535, y: 605 }, { x: 456, y: 450 }, { x: 560, y: 346 }, { x: 690, y: 425 }] },
  { id: 6, title: '混合路线', subtitle: '把路口、信号灯、环岛连起来', hint: '跟随路标完成整段安全路线', start: { x: 185, y: 360, angle: 0 }, checkpoints: [{ x: 185, y: 300 }, { x: 390, y: 155 }, { x: 535, y: 155 }, { x: 585, y: 335 }, { x: 456, y: 450 }, { x: 560, y: 346 }, { x: 690, y: 425 }] },
  { id: 7, title: '自由练习小镇', subtitle: '不限时 · 自选路线 · 即时温和提示', hint: '自由选择道路，随时查看练习回顾', start: { x: 185, y: 650, angle: 0 }, checkpoints: [] }
];

export const LANDMARKS = [
  { x: 210, y: 180, type: 't' }, { x: 560, y: 180, type: 'lights' },
  { x: 560, y: 450, type: 'roundabout' }, { x: 900, y: 450, type: 'give' },
  { x: 380, y: 720, type: 'bridge' }
];
