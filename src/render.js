import { BRIDGE, CONTROL_POINTS, JUNCTIONS, LANDMARKS, ROADS, SIGNAL_APPROACHES, WORLD } from './data.js';
import { signalForApproach } from './rules.js';

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
  context.fillStyle = COLORS.grass;
  context.fillRect(BRIDGE.from - 12, 668, BRIDGE.to - BRIDGE.from + 24, 104);
  const path = new Path2D();
  path.moveTo(BRIDGE.from - 20, 673);
  path.lineTo(BRIDGE.from, 697);
  path.lineTo(BRIDGE.to, 697);
  path.lineTo(BRIDGE.to + 20, 673);
  path.lineTo(BRIDGE.to + 20, 767);
  path.lineTo(BRIDGE.to, 743);
  path.lineTo(BRIDGE.from, 743);
  path.lineTo(BRIDGE.from - 20, 767);
  path.closePath();
  context.fillStyle = COLORS.edge;
  context.fill(path);
  context.save();
  context.translate(0, BRIDGE.y);
  context.scale(1, .94);
  context.translate(0, -BRIDGE.y);
  context.fillStyle = COLORS.asphalt;
  context.fill(path);
  context.restore();
  context.fillStyle = '#b3c5b0';
  context.fillRect(BRIDGE.from, 668, BRIDGE.to - BRIDGE.from, 23);
  context.fillRect(BRIDGE.from, 749, BRIDGE.to - BRIDGE.from, 23);
}

function drawCenterLines(context, region) {
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
      exclusions.push({ from: BRIDGE.from - 25, to: BRIDGE.to + 25 });
    }
    if (segment.axis === 'h' && segment.center === 180) exclusions.push({ from: 296, to: 366 });
    exclusions.sort((first, second) => first.from - second.from);
    let cursor = segment.from;
    for (const exclusion of exclusions) {
      if (exclusion.from > cursor) {
        context.beginPath();
        if (segment.axis === 'v') { context.moveTo(segment.center, cursor); context.lineTo(segment.center, exclusion.from); }
        else { context.moveTo(cursor, segment.center); context.lineTo(exclusion.from, segment.center); }
        context.stroke();
      }
      cursor = Math.max(cursor, exclusion.to);
    }
    if (cursor < segment.to) {
      context.beginPath();
      if (segment.axis === 'v') { context.moveTo(segment.center, cursor); context.lineTo(segment.center, segment.to); }
      else { context.moveTo(cursor, segment.center); context.lineTo(segment.to, segment.center); }
      context.stroke();
    }
  }
  context.setLineDash([]);
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

function drawGround(context, region) {
  context.fillStyle = COLORS.grass;
  context.fillRect(0, 0, WORLD.width, WORLD.height);
  for (let index = 0; index < 95; index += 1) {
    const x = (index * 173 + 49) % WORLD.width;
    const y = (index * 247 + 83) % WORLD.height;
    const nearRoad = ROADS.some(segment => segment.axis === 'v'
      ? Math.abs(x - segment.center) < segment.width / 2 + 23 && y > segment.from - 25 && y < segment.to + 25
      : Math.abs(y - segment.center) < segment.width / 2 + 23 && x > segment.from - 25 && x < segment.to + 25);
    if (!nearRoad) {
      circle(context, x + 3, y + 4, 12, '#547956');
      circle(context, x, y, 11, index % 3 ? '#396d55' : '#497d58');
      circle(context, x - 3, y - 3, 4, '#78a075');
    }
  }

  const rectangles = ROADS.map(roadRectangle);
  context.fillStyle = COLORS.edge;
  for (const rectangle of rectangles) context.fillRect(rectangle.x - 4, rectangle.y - 4, rectangle.width + 8, rectangle.height + 8);
  context.fillStyle = COLORS.asphalt;
  for (const rectangle of rectangles) context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  if (region.bridge) drawBridge(context);
  drawCenterLines(context, region);
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

function drawStopAndGiveWay(context, region) {
  const stop = CONTROL_POINTS.find(control => control.id === 'stop-t');
  const give = CONTROL_POINTS.find(control => control.id === 'give-t');
  drawControlLine(context, stop, region.stopLine);
  drawControlLine(context, give, region.giveLine, true);
  context.lineWidth = 5;
  context.fillStyle = COLORS.white;
  context.font = 'bold 13px Georgia, serif';
  context.textAlign = 'center';
  context.fillText('STOP', 185, 258);
  context.strokeStyle = COLORS.white;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(925, 364);
  context.lineTo(910, 391);
  context.lineTo(940, 391);
  context.closePath();
  context.stroke();
  stopSign(context, 146, 248);
  giveWaySign(context, 962, 390);
  for (const control of CONTROL_POINTS.filter(point => point.type === 'round-give')) {
    drawControlLine(context, control, region.giveLine, true);
  }
  if (region.bridge) {
    drawControlLine(context, CONTROL_POINTS.find(control => control.id === 'bridge-west'), region.giveLine, true);
    bridgeGiveSign(context, 299, 667);
    bridgePrioritySign(context, 460, 774);
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

function bridgeGiveSign(context, signX, signY) {
  circle(context, signX, signY, 18, '#bd5043');
  circle(context, signX, signY, 13, COLORS.white);
  context.font = 'bold 18px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#bd5043';
  context.fillText('↑', signX - 6, signY + 6);
  context.fillStyle = '#263e37';
  context.fillText('↓', signX + 6, signY + 6);
}

function bridgePrioritySign(context, signX, signY) {
  context.fillStyle = '#f4ead5';
  context.fillRect(signX - 20, signY - 18, 40, 36);
  context.fillStyle = '#39759a';
  context.fillRect(signX - 17, signY - 15, 34, 30);
  context.font = 'bold 19px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#fff9e8';
  context.fillText('←', signX - 5, signY + 5);
  context.fillStyle = '#de7364';
  context.fillText('→', signX + 8, signY + 5);
}

function drawCrossing(context) {
  context.fillStyle = '#e9ead9';
  for (let stripe = 0; stripe < 6; stripe += 1) context.fillRect(303 + stripe * 10, 135, 6, 90);
}

function drawLights(context, time, region) {
  for (const approach of SIGNAL_APPROACHES) {
    const state = signalForApproach(time, region, approach);
    drawControlLine(context, { ...approach, x: approach.position, y: approach.position }, COLORS.white);
    context.save();
    context.translate(approach.lightX, approach.lightY);
    context.rotate(approach.heading);
    context.fillStyle = '#1b3634';
    context.fillRect(-11, -22, 22, 44);
    circle(context, 0, -13, 5, state === 'red' || state === 'redAmber' ? '#f0755b' : '#70564a');
    circle(context, 0, 0, 5, state === 'amber' || state === 'redAmber' ? '#f6c35b' : '#6a644c');
    circle(context, 0, 13, 5, state === 'green' ? '#7cce84' : '#425d50');
    context.restore();
  }
}

function drawCar(context, vehicle, color, player = false) {
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
  if (player) {
    circle(context, 5, -4, 3, '#1d4b42');
    context.strokeStyle = '#fff1b9';
    context.lineWidth = 2;
    context.strokeRect(-14, -22, 28, 44);
  }
  if (vehicle.signal) {
    const blink = Math.floor(vehicle.clock * 3) % 2 === 0;
    if (blink) circle(context, vehicle.signal === 'left' ? -10 : 10, -17, 3, '#ffdc67');
  }
  context.restore();
}

function drawMarkers(context, game) {
  if (game.level.id === 7) return;
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
  drawGround(context, game.region);
  drawCrossing(context);
  drawStopAndGiveWay(context, game.region);
  drawLights(context, game.elapsed, game.region);
  drawMarkers(context, game);
  for (const npc of game.npcs) drawCar(context, npc, npc.color);
  drawCar(context, game.car, COLORS.player, true);
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
  context.scale(width / WORLD.width, height / WORLD.height);
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
  for (const landmark of LANDMARKS) {
    if (landmark.type !== 'bridge' || game.region.bridge) circle(context, landmark.x, landmark.y, 15, '#f4c169');
  }
  circle(context, game.car.x, game.car.y, 28, '#f6a542');
  context.restore();
}
