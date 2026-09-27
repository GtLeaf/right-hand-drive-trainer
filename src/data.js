// 地图锚点集中管理；扩大街区间距时保持车道、车辆和环岛的实际尺寸。
export const LAYOUT = { west: 220, center: 600, branch: 1160, east: 1500, north: 190, middle: 600, south: 1030 };
const L = LAYOUT;
export const WORLD = { width: 1600, height: 1200, roundabout: { x: L.center, y: L.middle, inner: 51, outer: 113 } };
export const CROSSING = { x: 370, y: L.north, width: 56, halfRoad: 47 };

export const ROADS = [
  { axis: 'v', center: L.west, from: L.north, to: L.south + 47, width: 94 },
  { axis: 'v', center: L.center, from: 60, to: 1110, width: 94 },
  { axis: 'v', center: L.branch, from: 90, to: L.middle, width: 94 },
  { axis: 'v', center: L.east, from: L.north - 47, to: L.south + 47, width: 94 },
  { axis: 'h', center: L.north, from: 80, to: L.east + 47, width: 94 },
  { axis: 'h', center: L.middle, from: 80, to: L.east + 47, width: 94 },
  { axis: 'h', center: L.south, from: L.west - 47, to: L.east + 47, width: 94 }
];

export const JUNCTIONS = [
  { id: 'stop-t', x: L.west, y: L.north, type: 't', radius: 48 },
  { id: 'signal', x: L.center, y: L.north, type: 'signal', radius: 48 },
  { id: 'north-east', x: L.branch, y: L.north, type: 'cross', radius: 48 },
  { id: 'east-north', x: L.east, y: L.north, type: 'corner', radius: 48 },
  { id: 'west-middle', x: L.west, y: L.middle, type: 'cross', radius: 48 },
  { id: 'roundabout', x: L.center, y: L.middle, type: 'roundabout', radius: 117 },
  { id: 'give-t', x: L.branch, y: L.middle, type: 't', radius: 48 },
  { id: 'east-middle', x: L.east, y: L.middle, type: 't', radius: 48 },
  { id: 'west-south', x: L.west, y: L.south, type: 'corner', radius: 48 },
  { id: 'south-middle', x: L.center, y: L.south, type: 'cross', radius: 48 },
  { id: 'east-south', x: L.east, y: L.south, type: 'corner', radius: 48 }
];

export const BRIDGE = {
  from: 365, to: 455, taperWest: 318, taperEast: 502,
  approachWest: 310, approachEast: 510, y: L.south, narrowWidth: 44,
  signWest: { x: 328, y: L.south - 86, heading: Math.PI / 2, priority: false },
  signEast: { x: 490, y: L.south + 88, heading: -Math.PI / 2, priority: true }
};

export function bridgeHalfWidth(x) {
  const b = BRIDGE;
  if (x < b.taperWest || x > b.taperEast) return 47;
  if (x < b.from) return 47 + (b.narrowWidth / 2 - 47) * (x - b.taperWest) / (b.from - b.taperWest);
  if (x > b.to) return b.narrowWidth / 2 + (47 - b.narrowWidth / 2) * (x - b.to) / (b.taperEast - b.to);
  return b.narrowWidth / 2;
}

export const BRIDGE_ROAD_POLYGON = [
  [BRIDGE.taperWest, BRIDGE.y - 47], [BRIDGE.from, BRIDGE.y - BRIDGE.narrowWidth / 2],
  [BRIDGE.to, BRIDGE.y - BRIDGE.narrowWidth / 2], [BRIDGE.taperEast, BRIDGE.y - 47],
  [BRIDGE.taperEast, BRIDGE.y + 47], [BRIDGE.to, BRIDGE.y + BRIDGE.narrowWidth / 2],
  [BRIDGE.from, BRIDGE.y + BRIDGE.narrowWidth / 2], [BRIDGE.taperWest, BRIDGE.y + 47]
];

// 主路两侧都接入街区；支路先渐宽，再留出完整的双入口选道段。
export const COMPLEX_T = {
  x: L.branch, y: L.middle,
  mainFrom: 820, mainFullFrom: 900, mainFullTo: 1400, mainTo: 1450, mainWidth: 164,
  medianWidth: 44, medianFrom: 920, medianTo: 1400,
  medianWestTip: L.branch - 98, turnBayFrom: L.branch + 60, turnBayTo: 1360,
  branchFrom: 90, branchTaperFrom: 300, branchFullFrom: 370, branchTo: L.middle,
  branchWidth: 144, branchWestEdge: L.branch - 72, branchEastEdge: L.branch + 72,
  branchDividerX: L.branch - 24, branchLaneDividerX: L.branch + 24,
  branchExitLane: L.branch - 48, branchRightLane: L.branch, branchLeftLane: L.branch + 48,
  giveWayY: L.middle - 106, cornerRadius: 24,
  eastboundLane: L.middle - 52, westboundLane: L.middle + 52,
  medianWaitMinX: L.branch - 76, medianWaitMaxX: L.branch + 40, medianWaitX: L.branch - 50
};

export function complexBranchSection(y) {
  const t = Math.max(0, Math.min(1, (y - COMPLEX_T.branchTaperFrom)
    / (COMPLEX_T.branchFullFrom - COMPLEX_T.branchTaperFrom)));
  return { west: COMPLEX_T.x - 47 + (COMPLEX_T.branchWestEdge - (COMPLEX_T.x - 47)) * t,
    east: COMPLEX_T.x + 47 + (COMPLEX_T.branchEastEdge - (COMPLEX_T.x + 47)) * t,
    divider: COMPLEX_T.x + (COMPLEX_T.branchDividerX - COMPLEX_T.x) * t };
}

// 绘制、道路范围和小地图共用同一组多边形，圆角用短线段逼近。
function complexRoadPolygons() {
  const t = COMPLEX_T;
  const top = t.y - t.mainWidth / 2;
  const bottom = t.y + t.mainWidth / 2;
  const branch = [[t.x - 47, t.branchFrom], [t.x + 47, t.branchFrom], [t.x + 47, t.branchTaperFrom],
    [t.branchEastEdge, t.branchFullFrom], [t.branchEastEdge, top - t.cornerRadius]];
  const arc = (cx, cy, from, to) => {
    for (let i = 1; i <= 12; i++) {
      const angle = from + (to - from) * i / 12;
      branch.push([cx + Math.cos(angle) * t.cornerRadius, cy + Math.sin(angle) * t.cornerRadius]);
    }
  };
  arc(t.branchEastEdge + t.cornerRadius, top - t.cornerRadius, Math.PI, Math.PI / 2);
  branch.push([t.branchEastEdge + t.cornerRadius, t.y], [t.branchWestEdge - t.cornerRadius, t.y],
    [t.branchWestEdge - t.cornerRadius, top]);
  arc(t.branchWestEdge - t.cornerRadius, top - t.cornerRadius, Math.PI / 2, 0);
  branch.push([t.branchWestEdge, t.branchFullFrom], [t.x - 47, t.branchTaperFrom]);
  return [
    [[t.mainFrom, t.y - 47], [t.mainFullFrom, top], [t.mainFullTo, top], [t.mainTo, t.y - 47],
      [t.mainTo, t.y + 47], [t.mainFullTo, bottom], [t.mainFullFrom, bottom], [t.mainFrom, t.y + 47]], branch
  ];
}
export const COMPLEX_ROAD_POLYGONS = complexRoadPolygons();

export const SIGNAL_APPROACHES = [
  { id: 'northbound', axis: 'y', direction: -1, position: L.north + 50, laneMin: L.center - 47, laneMax: L.center - 1, laneAxis: 'x', lightX: L.center - 80, lightY: L.north + 82, heading: 0, name: '北向' },
  { id: 'southbound', axis: 'y', direction: 1, position: L.north - 50, laneMin: L.center + 1, laneMax: L.center + 47, laneAxis: 'x', lightX: L.center + 80, lightY: L.north - 82, heading: Math.PI, name: '南向' },
  { id: 'eastbound', axis: 'x', direction: 1, position: L.center - 50, laneMin: L.north - 47, laneMax: L.north - 1, laneAxis: 'y', lightX: L.center - 82, lightY: L.north - 80, heading: Math.PI / 2, name: '东向' },
  { id: 'westbound', axis: 'x', direction: -1, position: L.center + 50, laneMin: L.north + 1, laneMax: L.north + 47, laneAxis: 'y', lightX: L.center + 82, lightY: L.north + 80, heading: -Math.PI / 2, name: '西向' }
];


// 近端主灯与远端重复灯归属于同一进口；位置不参与玩家和 NPC 的路权判断。
export const SIGNAL_HEADS = SIGNAL_APPROACHES.flatMap(approach => {
  const forward = { x: Math.sin(approach.heading), y: -Math.cos(approach.heading) };
  const right = { x: Math.cos(approach.heading), y: Math.sin(approach.heading) };
  return [
    { approachId: approach.id, kind: 'primary', x: approach.lightX, y: approach.lightY },
    { approachId: approach.id, kind: 'repeater',
      x: L.center + forward.x * 78 - right.x * 25,
      y: L.north + forward.y * 78 - right.y * 25,
      poleX: L.center + forward.x * 78 - right.x * 82,
      poleY: L.north + forward.y * 78 - right.y * 82 }
  ];
});

export const CONTROL_POINTS = [
  { id: 'stop-t', type: 'stop', x: L.west - 25, y: L.north + 50, axis: 'y', direction: -1, laneMin: L.west - 47, laneMax: L.west, laneAxis: 'x' },
  { id: 'give-t', type: 'give', x: L.branch + 25, y: L.middle - 48, axis: 'y', direction: 1, laneMin: L.branch, laneMax: L.branch + 47, laneAxis: 'x' },
  { id: 'complex-give', type: 'complex-give', x: COMPLEX_T.branchRightLane, y: COMPLEX_T.giveWayY, axis: 'y', direction: 1, laneMin: COMPLEX_T.branchDividerX, laneMax: COMPLEX_T.branchEastEdge, laneAxis: 'x' },
  { id: 'complex-median', type: 'complex-median', x: COMPLEX_T.medianWaitX, y: COMPLEX_T.y, axis: 'x', direction: -1, laneMin: COMPLEX_T.y - COMPLEX_T.medianWidth / 2, laneMax: COMPLEX_T.y + COMPLEX_T.medianWidth / 2, laneAxis: 'y' },
  { id: 'bridge-west', type: 'bridge-give', x: BRIDGE.approachWest, y: BRIDGE.y - 25, axis: 'x', direction: 1, laneMin: BRIDGE.y - 47, laneMax: BRIDGE.y - 2, laneAxis: 'y' },
  { id: 'bridge-east', type: 'bridge-priority', x: BRIDGE.approachEast, y: BRIDGE.y + 25, axis: 'x', direction: -1, laneMin: BRIDGE.y + 2, laneMax: BRIDGE.y + 47, laneAxis: 'y' },
  { id: 'round-south', type: 'round-give', x: L.center - 25, y: L.middle + 115, axis: 'y', direction: -1, laneMin: L.center - 47, laneMax: L.center - 1, laneAxis: 'x' },
  { id: 'round-north', type: 'round-give', x: L.center + 25, y: L.middle - 115, axis: 'y', direction: 1, laneMin: L.center + 1, laneMax: L.center + 47, laneAxis: 'x' },
  { id: 'round-west', type: 'round-give', x: L.center - 115, y: L.middle - 25, axis: 'x', direction: 1, laneMin: L.middle - 47, laneMax: L.middle - 1, laneAxis: 'y' },
  { id: 'round-east', type: 'round-give', x: L.center + 115, y: L.middle + 25, axis: 'x', direction: -1, laneMin: L.middle + 1, laneMax: L.middle + 47, laneAxis: 'y' }
];

export const REGIONS = {
  nz: { name: '新西兰', code: 'NZ', tag: 'NEW ZEALAND · ROAD CODE', stopLine: '#e6b84e', giveLine: '#f5f1dd', redAmber: false, bridge: true },
  uk: { name: '英国', code: 'UK', tag: 'UNITED KINGDOM · HIGHWAY CODE', stopLine: '#f5f1dd', giveLine: '#f5f1dd', redAmber: true, bridge: false }
};

export const LEVELS = [
  { id: 1, title: '左侧起步', subtitle: '找到正确车道，熟悉双拇指操作', hint: '沿左侧车道向前行驶', start: { x: L.west - 25, y: L.north + 470, angle: 0 }, checkpoints: [{ x: L.west - 25, y: L.north + 320 }, { x: L.west - 25, y: L.north + 135 }] },
  { id: 2, title: 'T 型左转', subtitle: 'STOP · 停稳观察后左转', hint: '在 STOP 线前停稳，左转驶入左侧车道', start: { x: L.west - 25, y: L.north + 180, angle: 0 }, checkpoints: [{ x: L.west - 25, y: L.north + 120 }, { x: L.west - 95, y: L.north + 25 }] },
  { id: 3, title: 'T 型右转', subtitle: 'GIVE WAY · 等待安全间隙', hint: '在东侧 T 字口让行后右转', start: { x: L.branch + 25, y: L.middle - 240, angle: Math.PI }, checkpoints: [{ x: L.branch + 25, y: L.middle - 145 }, { x: L.branch + 25, y: L.middle - 20 }, { x: L.branch - 120, y: L.middle + 25 }] },
  { id: 4, scenario: 'complex-t', title: '复杂 T 字口', subtitle: 'GIVE WAY · Flush Median 两段式右转', hint: '先在让行线前观察，再分两段驶入中央等待区', start: { x: COMPLEX_T.branchRightLane, y: COMPLEX_T.branchFullFrom + 10, angle: Math.PI }, checkpoints: [{ x: COMPLEX_T.branchRightLane, y: COMPLEX_T.giveWayY - 20 }, { x: COMPLEX_T.medianWaitX, y: COMPLEX_T.y }, { x: COMPLEX_T.x - 120, y: COMPLEX_T.westboundLane }] },
  { id: 5, title: '信号十字路口', subtitle: '圆灯与右转箭头 · 让对向车辆', hint: '按灯号通行，先右转再左转', start: { x: L.center - 25, y: L.north + 180, angle: 0 }, checkpoints: [{ x: L.center - 25, y: L.north + 85 }, { x: L.center + 170, y: L.north - 25 }, { x: L.branch - 25, y: L.north - 68 }] },
  { id: 6, title: '单车道环岛', subtitle: '入口让行 · 出口提前打左灯', hint: '提前打右灯，入口让行；通过前一出口后打左灯驶出', start: { x: L.center - 25, y: L.middle + 260, angle: 0 }, checkpoints: [{ x: L.center - 25, y: L.middle + 155 }, { x: L.center - 104, y: L.middle }, { x: L.center, y: L.middle - 104 }, { x: L.center + 160, y: L.middle - 25 }] },
  { id: 7, title: '混合路线', subtitle: '把路口、信号灯、环岛连起来', hint: '跟随路标完成整段安全路线', start: { x: L.west - 25, y: L.north + 180, angle: 0 }, checkpoints: [{ x: L.west - 25, y: L.north + 120 }, { x: L.center - 170, y: L.north - 25 }, { x: L.center - 25, y: L.north - 25 }, { x: L.center + 25, y: L.middle - 155 }, { x: L.center - 104, y: L.middle }, { x: L.center, y: L.middle - 104 }, { x: L.center + 160, y: L.middle - 25 }] },
  { id: 8, free: true, title: '自由练习小镇', subtitle: '不限时 · 自选路线 · 即时温和提示', hint: '自由选择道路，随时查看练习回顾', start: { x: L.west - 25, y: L.north + 470, angle: 0 }, checkpoints: [] }
];

export const LANDMARKS = [
  { x: L.west, y: L.north, type: 't' }, { x: L.center, y: L.north, type: 'lights' },
  { x: L.center, y: L.middle, type: 'roundabout' }, { x: L.branch, y: L.middle, type: 'give' },
  { x: (BRIDGE.from + BRIDGE.to) / 2, y: BRIDGE.y, type: 'bridge' }
];
