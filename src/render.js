import { LANDMARKS, ROADS, WORLD } from './data.js';
import { lightState } from './rules.js';

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

function road(context, x, y, width, height) {
  context.fillStyle = COLORS.edge;
  context.fillRect(x - 4, y - 4, width + 8, height + 8);
  context.fillStyle = COLORS.asphalt;
  context.fillRect(x, y, width, height);
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

  for (const segment of ROADS) {
    if (segment.axis === 'v') road(context, segment.center - segment.width / 2, segment.from, segment.width, segment.to - segment.from);
    else road(context, segment.from, segment.center - segment.width / 2, segment.to - segment.from, segment.width);
  }

  context.strokeStyle = COLORS.center;
  context.lineWidth = 2;
  context.setLineDash([16, 17]);
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
  context.setLineDash([]);

  circle(context, 560, 450, 117, COLORS.edge);
  circle(context, 560, 450, 113, COLORS.asphalt);
  circle(context, 560, 450, 51, COLORS.island);
  context.strokeStyle = '#b1c89c';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(560, 450, 48, 0, Math.PI * 2);
  context.stroke();
  circle(context, 560, 450, 17, '#84a771');
  circle(context, 548, 456, 7, '#a0ba7c');
  circle(context, 576, 443, 6, '#a0ba7c');

  if (region.bridge) {
    context.fillStyle = '#b9c5b0';
    context.fillRect(677, 663, 106, 114);
    context.fillStyle = '#677a75';
    context.fillRect(682, 699, 96, 42);
    context.strokeStyle = COLORS.edge;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(682, 694);
    context.lineTo(778, 694);
    context.moveTo(682, 746);
    context.lineTo(778, 746);
    context.stroke();
  }
}

function drawStopAndGiveWay(context, region, levelId) {
  context.lineWidth = 5;
  context.strokeStyle = levelId === 3 ? region.giveLine : region.stopLine;
  if (levelId === 3) context.setLineDash([8, 5]);
  context.beginPath();
  context.moveTo(164, 229);
  context.lineTo(207, 229);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = COLORS.white;
  context.font = 'bold 13px Georgia, serif';
  context.textAlign = 'center';
  context.fillText(levelId === 3 ? 'GIVE WAY' : 'STOP', 185, 252);
  sign(context, 149, 233, levelId === 3 ? 'GIVE' : 'STOP', levelId === 3 ? '#f3eee0' : '#bf584a');
  context.strokeStyle = region.giveLine;
  context.lineWidth = 3;
  context.setLineDash([8, 5]);
  context.beginPath();
  context.moveTo(879, 405);
  context.lineTo(923, 405);
  context.stroke();
  context.setLineDash([]);
  sign(context, 962, 390, 'GIVE', '#f3eee0');
  if (region.bridge) sign(context, 667, 672, '↔', '#f3eee0');
}

function sign(context, x, y, text, color) {
  circle(context, x, y, 17, '#21423a');
  circle(context, x, y, 14, color);
  context.fillStyle = color === '#f3eee0' ? '#243e36' : '#fff9e8';
  context.font = `bold ${text.length > 3 ? 8 : 16}px Georgia, serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x, y + 1);
  context.textBaseline = 'alphabetic';
}

function drawCrossing(context) {
  context.fillStyle = '#e9ead9';
  for (let stripe = 0; stripe < 6; stripe += 1) context.fillRect(303 + stripe * 10, 135, 6, 90);
  context.fillStyle = '#203c37';
  context.font = 'bold 12px Georgia, serif';
  context.fillText('40', 389, 690);
}

function drawLights(context, time, region) {
  const vertical = lightState(time, region);
  const horizontal = lightState(time, region, true);
  for (const [x, y, state] of [[514, 226, vertical], [606, 132, vertical], [504, 132, horizontal], [616, 226, horizontal]]) {
    context.fillStyle = '#1b3634';
    context.fillRect(x - 9, y - 18, 18, 36);
    circle(context, x, y - 11, 4, state === 'red' || state === 'redAmber' ? '#f0755b' : '#70564a');
    circle(context, x, y, 4, state === 'amber' || state === 'redAmber' ? '#f6c35b' : '#6a644c');
    circle(context, x, y + 11, 4, state === 'green' ? '#7cce84' : '#425d50');
  }
  context.strokeStyle = COLORS.white;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(513, 228);
  context.lineTo(558, 228);
  context.moveTo(562, 132);
  context.lineTo(608, 132);
  context.stroke();
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
  drawStopAndGiveWay(context, game.region, game.level.id);
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
