import { BRIDGE, BRIDGE_ROAD_POLYGON, COMPLEX_ROAD_POLYGONS, COMPLEX_T, CONTROL_POINTS, CROSSING, JUNCTIONS, LANDMARKS, ROADS, SIGNAL_APPROACHES, SIGNAL_HEADS, WORLD } from './data.js';
import { signalForApproach, rightArrowState } from './rules.js';

const COLORS = {
  grass: '#6f956c', grassDark: '#62865f', asphalt: '#506065', edge: '#d6d6ba',
  center: '#eee7c9', island: '#537a57', player: '#e8a941', white: '#faf5df'
};

function circle(context, x, y, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function roadRectangle(segment) {
  return segment.axis === 'v'
    ? { x: segment.center - segment.width / 2, y: segment.from, width: segment.width, height: segment.to - segment.from }
    : { x: segment.from, y: segment.center - segment.width / 2, width: segment.to - segment.from, height: segment.width };
}

function drawBridge(context) {
  const b = BRIDGE;
  context.save();
  // 清除原来整幅双车道路面，桥下河沟和两岸保持可辨认的连续轮廓。
  context.fillStyle = COLORS.grass;
  context.fillRect(b.taperWest, b.y - 54, b.taperEast - b.taperWest, 108);
  const channel = new Path2D();
  channel.moveTo(b.from + 10, b.y - 134);
  channel.bezierCurveTo(b.from - 5, b.y - 60, b.from + 16, b.y + 34, b.from + 2, b.y + 156);
  channel.lineTo(b.to - 6, b.y + 156);
  channel.bezierCurveTo(b.to + 6, b.y + 54, b.to - 12, b.y - 55, b.to - 3, b.y - 134);
  channel.closePath();
  context.strokeStyle = '#a8b69a';
  context.lineWidth = 12;
  context.stroke(channel);
  context.fillStyle = '#759b96';
  context.fill(channel);
  context.strokeStyle = '#a1bab0';
  context.lineWidth = 2;
  for (const dy of [-104, -80, 82, 115]) {
    context.beginPath();
    context.moveTo(b.from + 24, b.y + dy);
    context.quadraticCurveTo((b.from + b.to) / 2, b.y + dy + 5, b.to - 20, b.y + dy);
    context.stroke();
  }
  const road = polygonPath(BRIDGE_ROAD_POLYGON);
  context.fillStyle = COLORS.asphalt;
  context.fill(road);
  // 只描两侧边缘，桥头不画横跨路面的边框。
  context.strokeStyle = COLORS.edge;
  context.lineWidth = 3;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(b.taperWest, b.y + side * 47);
    context.lineTo(b.from, b.y + side * b.narrowWidth / 2);
    context.lineTo(b.to, b.y + side * b.narrowWidth / 2);
    context.lineTo(b.taperEast, b.y + side * 47);
    context.stroke();
    const railY = b.y + side * (b.narrowWidth / 2 + 5);
    context.fillStyle = '#29484044';
    context.fillRect(b.from + 2, railY + 4, b.to - b.from + 3, 7);
    context.fillStyle = '#c5cdbb';
    context.fillRect(b.from - 4, railY - 5, b.to - b.from + 8, 10);
    context.strokeStyle = '#fff9e7';
    context.lineWidth = 3;
    for (const offset of [-3, 3]) {
      context.beginPath();
      context.moveTo(b.from - 4, railY + offset);
      context.lineTo(b.to + 4, railY + offset);
      context.stroke();
    }
    context.fillStyle = '#fff9e7';
    for (let x = b.from; x <= b.to; x += 18) context.fillRect(x - 2, railY - 7, 4, 14);
  }
  context.restore();
}

function drawCenterLines(context, region, complex = false) {
  context.strokeStyle = COLORS.center;
  context.lineWidth = 2;
  context.setLineDash([16, 17]);
  for (const segment of ROADS) {
    const exclusions = JUNCTIONS.filter(junction => segment.axis === 'v'
      ? Math.abs(segment.center - junction.x) < 5 && junction.y >= segment.from && junction.y <= segment.to
      : Math.abs(segment.center - junction.y) < 5 && junction.x >= segment.from && junction.x <= segment.to)
      .map(junction => ({ from: (segment.axis === 'v' ? junction.y : junction.x) - junction.radius,
        to: (segment.axis === 'v' ? junction.y : junction.x) + junction.radius }));
    if (region.bridge && segment.axis === 'h' && segment.center === BRIDGE.y) {
      exclusions.push({ from: BRIDGE.approachWest - 5, to: BRIDGE.approachEast + 5 });
    }
    if (segment.axis === 'h' && segment.center === CROSSING.y) exclusions.push({ from: CROSSING.x - 7, to: CROSSING.x + 63 });
    if (complex && segment.axis === 'h' && segment.center === COMPLEX_T.y) {
      exclusions.push({ from: COMPLEX_T.mainFrom, to: COMPLEX_T.mainTo });
    }
    if (complex && segment.axis === 'v' && segment.center === COMPLEX_T.x) {
      exclusions.push({ from: COMPLEX_T.branchTaperFrom, to: COMPLEX_T.branchTo });
    }
    exclusions.sort((first, second) => first.from - second.from);
    let cursor = segment.from;
    for (const exclusion of exclusions) {
      if (exclusion.from - cursor >= 8) {
        context.beginPath();
        if (segment.axis === 'v') { context.moveTo(segment.center, cursor); context.lineTo(segment.center, exclusion.from); }
        else { context.moveTo(cursor, segment.center); context.lineTo(exclusion.from, segment.center); }
        context.stroke();
      }
      cursor = Math.max(cursor, exclusion.to);
    }
    if (segment.to - cursor >= 8) {
      context.beginPath();
      if (segment.axis === 'v') { context.moveTo(segment.center, cursor); context.lineTo(segment.center, segment.to); }
      else { context.moveTo(cursor, segment.center); context.lineTo(segment.to, segment.center); }
      context.stroke();
    }
  }
  context.setLineDash([]);
}

function polygonPath(points) {
  const path = new Path2D();
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y));
  path.closePath();
  return path;
}

function drawHatchedArea(context, points) {
  const path = polygonPath(points);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  context.save();
  context.clip(path);
  context.strokeStyle = COLORS.white;
  context.lineWidth = 2;
  for (let x = Math.min(...xs) - 60; x < Math.max(...xs) + 60; x += 28) {
    context.beginPath();
    context.moveTo(x, bottom);
    context.lineTo(x + bottom - top, top);
    context.stroke();
  }
  context.restore();
  context.strokeStyle = COLORS.white;
  context.lineWidth = 2;
  context.stroke(path);
}

function drawFlushMedian(context) {
  const t = COMPLEX_T;
  const top = t.y - t.medianWidth / 2, bottom = t.y + t.medianWidth / 2;
  // 两端导流斜纹在路口前收尖；中间开口保持完整沥青路面。
  drawHatchedArea(context, [[t.medianFrom, top], [t.medianWestTip - 28, top],
    [t.medianWestTip, bottom], [t.medianFrom, bottom]]);
  drawHatchedArea(context, [[t.turnBayTo, bottom], [t.medianTo, top], [t.medianTo, bottom]]);
  context.strokeStyle = COLORS.white;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(t.turnBayFrom, top);
  context.lineTo(t.medianTo, top);
  context.stroke();
  // 主路西行车辆从这里右转驶入支路；入口边界为普通车道虚线，无轨迹箭头。
  context.setLineDash([9, 8]);
  context.beginPath();
  context.moveTo(t.turnBayFrom, bottom);
  context.lineTo(t.turnBayTo, bottom);
  context.stroke();
  context.setLineDash([]);
  drawTurnLaneArrow(context, (t.turnBayFrom + t.turnBayTo) / 2, t.y, 'right', -Math.PI / 2, .65);
}

function drawRoundabout(context) {
  const { x, y, inner, outer } = WORLD.roundabout;
  circle(context, x, y, outer, COLORS.asphalt);
  context.strokeStyle = COLORS.edge;
  context.lineWidth = 4;
  for (let index = 0; index < 4; index += 1) {
    context.beginPath();
    context.arc(x, y, outer + 2, -Math.PI / 2 + .42 + index * Math.PI / 2,
      -Math.PI / 2 - .42 + (index + 1) * Math.PI / 2);
    context.stroke();
  }
  circle(context, x, y, inner, COLORS.island);
  context.strokeStyle = '#b1c89c';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x, y, inner - 3, 0, Math.PI * 2);
  context.stroke();
  circle(context, x, y, 17, '#84a771');
  circle(context, x - 12, y + 6, 7, '#a0ba7c');
  circle(context, x + 16, y - 7, 6, '#a0ba7c');
}

function drawGround(context, region, complex = false) {
  context.fillStyle = COLORS.grass;
  context.fillRect(0, 0, WORLD.width, WORLD.height);
  for (let index = 0; index < 185; index += 1) {
    const x = (index * 173 + 49) % WORLD.width;
    const y = (index * 247 + 83) % WORLD.height;
    const complexRoad = complex && x > COMPLEX_T.mainFrom - 25 && x < COMPLEX_T.mainTo + 25
      && Math.abs(y - COMPLEX_T.y) < COMPLEX_T.mainWidth / 2 + 23;
    const complexBranchRoad = complex && x > COMPLEX_T.x - COMPLEX_T.branchWidth / 2 - 23
      && x < COMPLEX_T.x + COMPLEX_T.branchWidth / 2 + 23
      && y > COMPLEX_T.branchFrom - 25 && y < COMPLEX_T.branchTo + 25;
    const nearRoad = complexRoad || complexBranchRoad || ROADS.some(segment => segment.axis === 'v'
      ? Math.abs(x - segment.center) < segment.width / 2 + 23 && y > segment.from - 25 && y < segment.to + 25
      : Math.abs(y - segment.center) < segment.width / 2 + 23 && x > segment.from - 25 && x < segment.to + 25);
    if (!nearRoad) {
      circle(context, x + 3, y + 4, 12, '#547956');
      circle(context, x, y, 11, index % 3 ? '#396d55' : '#497d58');
      circle(context, x - 3, y - 3, 4, '#78a075');
    }
  }

  const paths = ROADS.map(roadRectangle).map(rectangle => {
    const path = new Path2D();
    path.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    return path;
  });
  if (complex) paths.push(...COMPLEX_ROAD_POLYGONS.map(polygonPath));
  // 先画所有外沿，再填充路面的并集，避免路缘横穿支路开口。
  context.strokeStyle = COLORS.edge;
  context.lineWidth = 8;
  context.lineJoin = 'round';
  for (const path of paths) context.stroke(path);
  context.fillStyle = COLORS.asphalt;
  for (const path of paths) context.fill(path);
  if (region.bridge) drawBridge(context);
  drawCenterLines(context, region, complex);
  if (complex) drawFlushMedian(context);
  drawRoundabout(context);
}

function drawControlLine(context, control, color, dashed = false) {
  context.strokeStyle = color;
  context.lineWidth = dashed ? 3 : 5;
  context.setLineDash(dashed ? [7, 5] : []);
  context.beginPath();
  if (control.axis === 'y') {
    context.moveTo(control.laneMin, control.y);
    context.lineTo(control.laneMax, control.y);
  } else {
    context.moveTo(control.x, control.laneMin);
    context.lineTo(control.x, control.laneMax);
  }
  context.stroke();
  context.setLineDash([]);
}

function drawYieldTriangle(context, x, y) {
  context.strokeStyle = COLORS.white;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x, y + 14);
  context.lineTo(x - 16, y - 12);
  context.lineTo(x + 16, y - 12);
  context.closePath();
  context.stroke();
}

function drawArrowHead(context, x, y, angle, size, color) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(size, 0);
  context.lineTo(-size * .72, -size * .56);
  context.lineTo(-size * .72, size * .56);
  context.closePath();
  context.fill();
  context.restore();
}

function drawTurnLaneArrow(context, x, y, direction, heading = 0, scale = 1) {
  context.save();
  context.translate(x, y);
  context.rotate(heading);
  context.scale(scale, scale);
  x = 0; y = 0;
  const color = COLORS.white;
  const sign = direction === 'left' ? -1 : 1;
  const endX = x + sign * 28;
  const endY = y - 18;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(x, y + 21);
  context.lineTo(x, y - 3);
  context.quadraticCurveTo(x, endY, endX, endY);
  context.stroke();
  context.restore();
  drawArrowHead(context, endX, endY, sign < 0 ? Math.PI : 0, 8, color);
  context.restore();
}

function drawRoadDirectionArrow(context, x, y, direction, color = COLORS.white) {
  const sign = direction === 'west' ? -1 : 1;
  const endX = x + sign * 22;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x - sign * 20, y);
  context.lineTo(endX, y);
  context.stroke();
  context.restore();
  drawArrowHead(context, endX, y, sign < 0 ? Math.PI : 0, 7, color);
}

function drawComplexTMarkings(context, region) {
  const t = COMPLEX_T;
  const give = CONTROL_POINTS.find(control => control.id === 'complex-give');
  context.strokeStyle = COLORS.white;
  context.lineWidth = 2;
  // 双向分界随支路渐宽过渡；靠路口右侧为两条驶入车道。
  context.beginPath();
  context.moveTo(t.x, t.branchTaperFrom);
  context.lineTo(t.branchDividerX, t.branchFullFrom);
  context.lineTo(t.branchDividerX, t.giveWayY);
  context.stroke();
  context.setLineDash([10, 10]);
  context.beginPath();
  context.moveTo(t.branchLaneDividerX, t.branchFullFrom - 8);
  context.lineTo(t.branchLaneDividerX, t.giveWayY);
  context.stroke();
  context.setLineDash([]);
  drawControlLine(context, give, region.giveLine, true);
  drawTurnLaneArrow(context, t.branchRightLane, t.giveWayY - 44, 'right', Math.PI, .65);
  drawTurnLaneArrow(context, t.branchLeftLane, t.giveWayY - 44, 'left', Math.PI, .65);
  context.save();
  context.translate(t.branchExitLane, t.giveWayY - 44);
  context.rotate(-Math.PI / 2);
  drawRoadDirectionArrow(context, 0, 0, 'east');
  context.restore();
  drawRoadDirectionArrow(context, t.medianFrom + 55, t.eastboundLane, 'east');
  drawRoadDirectionArrow(context, t.medianFrom + 55, t.westboundLane, 'west');
}

function drawStopAndGiveWay(context, region, complex = false) {
  const stop = CONTROL_POINTS.find(control => control.id === 'stop-t');
  const give = CONTROL_POINTS.find(control => control.id === 'give-t');
  drawControlLine(context, stop, region.stopLine);
  if (complex) drawComplexTMarkings(context, region);
  else drawControlLine(context, give, region.giveLine, true);
  context.lineWidth = 5;
  context.fillStyle = COLORS.white;
  context.font = 'bold 13px Georgia, serif';
  context.textAlign = 'center';
  context.fillText('STOP', stop.x, stop.y + 28);
  context.strokeStyle = COLORS.white;
  context.lineWidth = 3;
  if (!complex) {
    context.beginPath();
    context.moveTo(give.x, give.y - 38);
    context.lineTo(give.x - 15, give.y - 11);
    context.lineTo(give.x + 15, give.y - 11);
    context.closePath();
    context.stroke();
  }
  stopSign(context, stop.laneMin - 17, stop.y + 18);
  giveWaySign(context, complex ? COMPLEX_T.branchEastEdge + 25 : give.laneMax + 15, complex ? COMPLEX_T.giveWayY - 18 : give.y - 12);
  for (const control of CONTROL_POINTS.filter(point => point.type === 'round-give')) {
    drawControlLine(context, control, region.giveLine, true);
  }
  if (region.bridge) {
    drawControlLine(context, CONTROL_POINTS.find(control => control.id === 'bridge-west'), region.giveLine, true);
    drawBridgeSignAssembly(context, BRIDGE.signWest);
    drawBridgeSignAssembly(context, BRIDGE.signEast);
  }
}

function stopSign(context, signX, signY) {
  for (const [radius, color] of [[19, '#f7f0db'], [16, '#bc4c41']]) {
    context.fillStyle = color;
    context.beginPath();
    for (let corner = 0; corner < 8; corner += 1) {
      const angle = Math.PI / 8 + corner * Math.PI / 4;
      const vertexX = signX + Math.cos(angle) * radius;
      const vertexY = signY + Math.sin(angle) * radius;
      if (corner === 0) context.moveTo(vertexX, vertexY);
      else context.lineTo(vertexX, vertexY);
    }
    context.closePath();
    context.fill();
  }
  context.fillStyle = '#fff9e8';
  context.font = 'bold 9px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('STOP', signX, signY + 1);
  context.textBaseline = 'alphabetic';
}

function giveWaySign(context, signX, signY) {
  context.save();
  context.translate(signX, signY);
  context.rotate(Math.PI);
  context.fillStyle = '#bb5043';
  context.beginPath();
  context.moveTo(-20, -18);
  context.lineTo(20, -18);
  context.lineTo(0, 19);
  context.closePath();
  context.fill();
  context.fillStyle = COLORS.white;
  context.beginPath();
  context.moveTo(-13, -13);
  context.lineTo(13, -13);
  context.lineTo(0, 10);
  context.closePath();
  context.fill();
  context.fillStyle = '#263e37';
  context.font = 'bold 6px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('GIVE', 0, -6);
  context.fillText('WAY', 0, 1);
  context.restore();
}

function drawBridgeSignAssembly(context, sign) {
  context.save();
  context.translate(sign.x, sign.y);
  context.rotate(sign.heading);
  // 图中的上下叠牌共用一根立柱，局部坐标始终面向接近车辆。
  context.fillStyle = '#2c494044';
  context.fillRect(2, -2, 5, 59);
  context.fillStyle = '#dfe2d0';
  context.fillRect(-2, -5, 4, 59);
  narrowBridgeWarningSign(context, 0, -28);
  if (sign.priority) bridgePrioritySign(context, 0, 22);
  else bridgeGiveSign(context, 0, 22);
  context.restore();
}

function narrowBridgeWarningSign(context, signX, signY) {
  context.save();
  context.translate(signX, signY);
  const diamond = polygonPath([[0, -24], [24, 0], [0, 24], [-24, 0]]);
  context.fillStyle = '#e8b637';
  context.fill(diamond);
  context.strokeStyle = '#223630';
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.stroke(diamond);
  context.strokeStyle = '#1d302e';
  context.lineWidth = 4;
  context.lineCap = 'butt';
  context.lineJoin = 'miter';
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(side * 10, -12);
    context.lineTo(side * 6, -5);
    context.lineTo(side * 6, 5);
    context.lineTo(side * 10, 12);
    context.stroke();
  }
  context.restore();
}

function bridgeGiveSign(context, signX, signY) {
  circle(context, signX, signY, 18, '#bd5043');
  circle(context, signX, signY, 13, COLORS.white);
  arrow(context, signX - 7, signY + 2, 'down', '#263e37', 10, 27);
  arrow(context, signX + 8, signY - 3, 'up', '#bd5043', 6, 18);
}

function arrow(context, x, y, direction, color, width, height) {
  const halfWidth = width / 2;
  const headHeight = height * .34;
  const shaftWidth = width * .32;
  const shaftHalf = shaftWidth / 2;
  const top = -height / 2;
  const bottom = height / 2;
  context.save();
  context.translate(x, y);
  if (direction === 'down') context.rotate(Math.PI);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, top);
  context.lineTo(halfWidth, top + headHeight);
  context.lineTo(shaftHalf, top + headHeight);
  context.lineTo(shaftHalf, bottom);
  context.lineTo(-shaftHalf, bottom);
  context.lineTo(-shaftHalf, top + headHeight);
  context.lineTo(-halfWidth, top + headHeight);
  context.closePath();
  context.fill();
  context.restore();
}

function bridgePrioritySign(context, signX, signY) {
  context.save();
  context.fillStyle = '#fbf7e7';
  context.beginPath();
  context.roundRect(signX - 19, signY - 24, 38, 48, 3);
  context.fill();
  context.fillStyle = '#1253a3';
  context.beginPath();
  context.roundRect(signX - 17, signY - 22, 34, 44, 2);
  context.fill();
  arrow(context, signX - 7, signY - 1, 'up', '#fff9e8', 12, 33);
  arrow(context, signX + 9, signY + 5, 'down', '#d85d48', 8, 23);
  context.restore();
}

function drawCrossing(context) {
  // 候行区留在道路两侧，人物颜色沿用现有低饱和配色。
  for (const side of [-1, 1]) {
    context.fillStyle = '#c5cdbb';
    context.fillRect(CROSSING.x - 5, CROSSING.y + side * 60 - 10, CROSSING.width + 10, 20);
    circle(context, CROSSING.x - 10, CROSSING.y + side * 55, 5, '#e8b637');
  }
  context.fillStyle = '#e9ead9';
  for (let stripe = 0; stripe < 6; stripe += 1) context.fillRect(CROSSING.x + stripe * 10, CROSSING.y - 45, 6, 90);
}

function signalHeadView(head, approach, viewer) {
  // 俯视教学按驾驶朝向呈现灯面；越过灯杆后不能从背面继续看到放行灯色。
  const alignment = Math.cos(viewer.angle - approach.heading);
  const ahead = (head.x - viewer.x) * Math.sin(approach.heading)
    - (head.y - viewer.y) * Math.cos(approach.heading);
  if (Math.abs(alignment) <= .5) return 'side';
  if (ahead < -4 || alignment < -.5) return 'back';
  return 'front';
}

function drawSignalHead(context, head, approach, region, state, arrowState, viewer) {
  const view = signalHeadView(head, approach, viewer);
  const hasArrow = region.code === 'NZ';
  const width = hasArrow ? 44 : 24;
  context.save();
  context.translate(head.x, head.y);
  context.rotate(approach.heading);
  context.fillStyle = '#87968c';
  context.fillRect(-2, 20, 4, 11);
  if (view === 'side') {
    context.fillStyle = '#364944';
    context.fillRect(-4, -23, 8, 46);
    context.fillStyle = '#98a498';
    context.fillRect(-4, -20, 2, 40);
  } else {
    context.fillStyle = view === 'front' ? '#1b3634' : '#4a5b53';
    context.beginPath();
    context.roundRect(-width / 2, -24, width, 48, 3);
    context.fill();
    context.strokeStyle = view === 'front' ? '#d6d6ba' : '#87968c';
    context.lineWidth = 1;
    context.stroke();
    if (view === 'back') {
      // 背板只显示安装筋，不画熄灭的灯泡，避免被误认成故障灯。
      context.strokeStyle = '#87968c';
      context.beginPath();
      context.moveTo(-width / 2 + 4, -15); context.lineTo(width / 2 - 4, -15);
      context.moveTo(-width / 2 + 4, 15); context.lineTo(width / 2 - 4, 15);
      context.stroke();
    } else {
      const circleX = hasArrow ? -10 : 0;
      circle(context, circleX, -14, 5, state === 'red' || state === 'redAmber' ? '#f0755b' : '#70564a');
      circle(context, circleX, 0, 5, state === 'amber' || state === 'redAmber' ? '#f6c35b' : '#6a644c');
      circle(context, circleX, 14, 5, state === 'green' ? '#7cce84' : '#425d50');
      if (hasArrow) {
        context.fillStyle = '#506065';
        context.fillRect(0, -20, 1, 40);
        for (const [index, color] of ['red', 'amber', 'green'].entries()) {
          const y = index * 14 - 14;
          context.strokeStyle = arrowState === color ? { red: '#f0755b', amber: '#f6c35b', green: '#7cce84' }[color] : '#42504b';
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(5, y); context.lineTo(17, y);
          context.moveTo(12, y - 5); context.lineTo(17, y); context.lineTo(12, y + 5);
          context.stroke();
        }
      }
    }
  }
  context.restore();
}

function drawLights(context, time, region, viewer) {
  // 先画悬臂支架，再画灯头，表明重复灯悬在车道上方。
  for (const head of SIGNAL_HEADS.filter(item => item.kind === 'repeater')) {
    context.strokeStyle = '#344c46';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(head.poleX, head.poleY); context.lineTo(head.x, head.y);
    context.stroke();
    context.strokeStyle = '#aab4a2';
    context.lineWidth = 2;
    context.stroke();
    circle(context, head.poleX, head.poleY, 5, '#aab4a2');
  }
  for (const approach of SIGNAL_APPROACHES) {
    const state = signalForApproach(time, region, approach);
    const arrowState = rightArrowState(time, region, approach);
    for (const head of SIGNAL_HEADS.filter(item => item.approachId === approach.id)) {
      drawSignalHead(context, head, approach, region, state, arrowState, viewer);
    }
  }
}

function drawPedestrians(context, pedestrians, time) {
  for (const person of pedestrians) {
    context.save();
    context.translate(person.x, person.y);
    context.fillStyle = '#263d3d44';
    context.beginPath(); context.ellipse(2, 3, 7, 5, 0, 0, Math.PI * 2); context.fill();
    const stride = person.state === 'crossing' ? Math.sin(time * 9) * 3 : 0;
    context.strokeStyle = '#263e37'; context.lineWidth = 3; context.lineCap = 'round';
    context.beginPath(); context.moveTo(-3, 0); context.lineTo(-3, 5 + stride);
    context.moveTo(3, 0); context.lineTo(3, 5 - stride); context.stroke();
    context.fillStyle = person.id ? '#e2b482' : '#d8e7cf';
    context.fillRect(-6, -4, 12, 7);
    circle(context, 0, -3, 4, '#f0c89c');
    context.restore();
  }
}

function drawCar(context, vehicle, color, time, player = false, braking = false) {
  context.save();
  context.translate(vehicle.x, vehicle.y);
  context.rotate(vehicle.angle);
  context.fillStyle = '#263d3d55';
  context.fillRect(-11, -15, 26, 38);
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(-11, -19, 22, 38, 6);
  context.fill();
  context.fillStyle = '#b5d5c8';
  context.fillRect(-8, -11, 16, 8);
  context.fillStyle = '#354b4a';
  context.fillRect(-8, 11, 16, 4);
  context.fillStyle = '#fff4cb';
  context.fillRect(-9, -19, 5, 3);
  context.fillRect(4, -19, 5, 3);
  context.fillStyle = braking ? '#ff554b' : '#914941';
  if (braking) {
    context.shadowColor = '#ff554b';
    context.shadowBlur = 9;
  }
  context.fillRect(-7, 16, 5, 3);
  context.fillRect(2, 16, 5, 3);
  context.shadowBlur = 0;
  if (player) {
    circle(context, 5, -4, 3, '#1d4b42');
    context.strokeStyle = '#fff1b9';
    context.lineWidth = 2;
    context.strokeRect(-14, -22, 28, 44);
  }
  if (vehicle.signal && Math.floor(time * 3) % 2 === 0) {
    const indicatorX = vehicle.signal === 'left' ? -11 : 8;
    context.fillStyle = '#ffdc67';
    context.shadowColor = '#ffc04e';
    context.shadowBlur = 8;
    context.fillRect(indicatorX, -18, 3, 5);
    context.fillRect(indicatorX, 14, 3, 5);
  }
  context.restore();
}

function drawMarkers(context, game) {
  if (game.level.free) return;
  const target = game.level.checkpoints[game.checkpoint];
  if (!target) return;
  const pulse = 24 + Math.sin(game.elapsed * 3) * 4;
  context.strokeStyle = '#f7c05d';
  context.lineWidth = 4;
  context.beginPath();
  context.arc(target.x, target.y, pulse, 0, Math.PI * 2);
  context.stroke();
  circle(context, target.x, target.y, 5, '#f7c05d');
}

export function render(context, game, width, height) {
  context.clearRect(0, 0, width, height);
  context.save();
  const scale = Math.max(.6, Math.min(1.25, height / 370));
  context.translate(width / 2, height * .62);
  context.scale(scale, scale);
  context.rotate(-game.car.angle);
  context.translate(-game.car.x, -game.car.y);
  const complex = game.level.scenario === 'complex-t' || game.level.free;
  drawGround(context, game.region, complex);
  drawCrossing(context);
  drawStopAndGiveWay(context, game.region, complex);
  for (const approach of SIGNAL_APPROACHES) {
    drawControlLine(context, { ...approach, x: approach.position, y: approach.position }, COLORS.white);
  }
  drawMarkers(context, game);
  drawPedestrians(context, game.pedestrians || [], game.elapsed);
  for (const npc of game.npcs) drawCar(context, npc, npc.color, game.elapsed, false, npc.state !== 'cruise');
  drawCar(context, game.car, COLORS.player, game.elapsed, true, game.input.brake);
  // 悬空灯头位于车辆上方，不能被远处同车道的 NPC 遮掉；停车线仍在地面层。
  drawLights(context, game.elapsed, game.region, game.car);
  context.restore();
  context.strokeStyle = '#ffffff33';
  context.lineWidth = 1;
  context.strokeRect(.5, .5, width - 1, height - 1);
}

export function renderMiniMap(context, game, width, height) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#385e51';
  context.fillRect(0, 0, width, height);
  context.save();
  const mapScale = Math.min(width / WORLD.width, height / WORLD.height);
  context.translate((width - WORLD.width * mapScale) / 2, (height - WORLD.height * mapScale) / 2);
  context.scale(mapScale, mapScale);
  context.lineWidth = 90;
  context.strokeStyle = '#a9b8a8';
  for (const segment of ROADS) {
    context.beginPath();
    if (segment.axis === 'v') {
      context.moveTo(segment.center, segment.from);
      context.lineTo(segment.center, segment.to);
    } else {
      context.moveTo(segment.from, segment.center);
      context.lineTo(segment.to, segment.center);
    }
    context.stroke();
  }
  if (game.level.scenario === 'complex-t' || game.level.free) {
    context.fillStyle = '#a9b8a8';
    for (const points of COMPLEX_ROAD_POLYGONS) context.fill(polygonPath(points));
    context.strokeStyle = COLORS.white;
    context.lineWidth = 3;
    for (const [from, to] of [[COMPLEX_T.medianFrom, COMPLEX_T.medianWestTip],
      [COMPLEX_T.turnBayFrom, COMPLEX_T.medianTo]]) {
      context.beginPath();
      context.moveTo(from, COMPLEX_T.y);
      context.lineTo(to, COMPLEX_T.y);
      context.stroke();
    }
  }
  if (game.region.bridge) {
    context.fillStyle = '#385e51';
    context.fillRect(BRIDGE.taperWest, BRIDGE.y - 50, BRIDGE.taperEast - BRIDGE.taperWest, 100);
    context.fillStyle = '#a9b8a8';
    context.fill(polygonPath(BRIDGE_ROAD_POLYGON));
  }
  const ring = WORLD.roundabout;
  circle(context, ring.x, ring.y, ring.outer, '#a9b8a8');
  circle(context, ring.x, ring.y, ring.inner, '#385e51');
  for (const landmark of LANDMARKS) {
    if (landmark.type !== 'bridge' || game.region.bridge) circle(context, landmark.x, landmark.y, 15, '#f4c169');
  }
  circle(context, game.car.x, game.car.y, 28, '#f6a542');
  context.restore();
}
