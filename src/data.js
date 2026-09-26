export const WORLD = { width: 1100, height: 880, roundabout: { x: 560, y: 450, inner: 51, outer: 113 } };

export const ROADS = [
  { axis: 'v', center: 210, from: 180, to: 810, width: 94 },
  { axis: 'v', center: 560, from: 70, to: 810, width: 94 },
  { axis: 'v', center: 900, from: 70, to: 450, width: 94 },
  { axis: 'h', center: 180, from: 70, to: 1030, width: 94 },
  { axis: 'h', center: 450, from: 70, to: 1030, width: 94 },
  { axis: 'h', center: 720, from: 70, to: 1030, width: 94 }
];

export const REGIONS = {
  nz: { name: '新西兰', code: 'NZ', tag: 'NEW ZEALAND · ROAD CODE', stopLine: '#e6b84e', giveLine: '#f5f1dd', redAmber: false, bridge: true },
  uk: { name: '英国', code: 'UK', tag: 'UNITED KINGDOM · HIGHWAY CODE', stopLine: '#f5f1dd', giveLine: '#f5f1dd', redAmber: true, bridge: false }
};

export const LEVELS = [
  { id: 1, title: '左侧起步', subtitle: '找到正确车道，熟悉双拇指操作', hint: '沿左侧车道向前行驶', start: { x: 185, y: 650, angle: 0 }, checkpoints: [{ x: 185, y: 500 }, { x: 185, y: 315 }] },
  { id: 2, title: 'T 型左转', subtitle: 'STOP · 停稳观察后左转', hint: '在 STOP 线前停稳，左转驶入左侧车道', start: { x: 185, y: 360, angle: 0 }, checkpoints: [{ x: 185, y: 263 }, { x: 115, y: 205 }] },
  { id: 3, title: 'T 型右转', subtitle: 'GIVE WAY · 等待安全间隙', hint: '让行主路车辆，再右转', start: { x: 185, y: 360, angle: 0 }, checkpoints: [{ x: 185, y: 263 }, { x: 350, y: 155 }] },
  { id: 4, title: '信号十字路口', subtitle: '看灯色、对向车辆与过街行人', hint: '按灯号通行，先右转再左转', start: { x: 535, y: 375, angle: 0 }, checkpoints: [{ x: 535, y: 275 }, { x: 730, y: 155 }, { x: 875, y: 112 }] },
  { id: 5, title: '单车道环岛', subtitle: '入口让行 · 出口提前打左灯', hint: '让行后绕过中心岛，驶向右侧出口', start: { x: 535, y: 650, angle: 0 }, checkpoints: [{ x: 535, y: 570 }, { x: 456, y: 450 }, { x: 560, y: 346 }, { x: 690, y: 425 }] },
  { id: 6, title: '混合路线', subtitle: '把路口、信号灯、环岛连起来', hint: '跟随路标完成整段安全路线', start: { x: 185, y: 360, angle: 0 }, checkpoints: [{ x: 185, y: 263 }, { x: 340, y: 155 }, { x: 535, y: 155 }, { x: 585, y: 335 }, { x: 456, y: 450 }, { x: 560, y: 346 }, { x: 690, y: 425 }] },
  { id: 7, title: '自由练习小镇', subtitle: '不限时 · 自选路线 · 即时温和提示', hint: '自由选择道路，随时查看练习回顾', start: { x: 185, y: 650, angle: 0 }, checkpoints: [] }
];

export const LANDMARKS = [
  { x: 210, y: 180, type: 't' }, { x: 560, y: 180, type: 'lights' },
  { x: 560, y: 450, type: 'roundabout' }, { x: 900, y: 450, type: 'give' },
  { x: 730, y: 720, type: 'bridge' }
];
