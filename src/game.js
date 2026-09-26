import { LEVELS, REGIONS, WORLD } from './data.js';
import { clamp, crossed, distance, isOnRoad, lightState, nearbyNpc, steeringStep, wrongSide } from './rules.js';
import { render, renderMiniMap } from './render.js';

const elements = Object.fromEntries([
  'home', 'play', 'home-button', 'back-button', 'restart-button', 'pause-button',
  'level-list', 'region-caption', 'game-canvas', 'mini-map', 'mini-toggle', 'mission-label',
  'mission-text', 'play-index', 'play-name', 'speed', 'toast', 'status-banner',
  'game-dialog', 'dialog-kicker', 'dialog-title', 'dialog-body', 'dialog-primary',
  'dialog-secondary', 'steer-track', 'steer-knob', 'throttle', 'brake',
  'signal-left', 'signal-right', 'density-button', 'review-button', 'offline-status'
].map(id => [id, document.getElementById(id)]));

const canvas = elements['game-canvas'];
const context = canvas.getContext('2d');
const miniMap = elements['mini-map'];
const miniContext = miniMap.getContext('2d');
const STORAGE_KEY = 'right-side-ready-progress-v1';
let regionKey = 'nz';
let progress = readProgress();
let game = null;
let lastFrame = 0;
let dialogPrimary = () => {};
let dialogSecondary = () => {};

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { nz: clamp(Number(saved.nz) || 0, 0, 6), uk: clamp(Number(saved.uk) || 0, 0, 6) };
  } catch (error) {
    console.warn('本机存档不可读取，本次练习从头开始。', error);
    return { nz: 0, uk: 0 };
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn('本机存档不可写入，本次进度可能不会保留。', error);
    elements['offline-status'].textContent = '离线可玩 · 本机存档不可用';
  }
}

function renderLevelList() {
  elements['region-caption'].textContent = REGIONS[regionKey].tag;
  elements['level-list'].innerHTML = LEVELS.map(level => {
    const unlocked = level.id <= progress[regionKey] + 1 && (level.id !== 7 || progress[regionKey] >= 6);
    const complete = level.id <= progress[regionKey];
    return `<button class="level-card ${level.id === 7 ? 'free' : ''}" type="button" data-level="${level.id}" ${unlocked ? '' : 'disabled'}>
      <span class="level-number">${String(level.id).padStart(2, '0')}</span>
      <span class="level-info"><strong>${level.title}</strong><small>${level.subtitle}</small></span>
      <span class="level-end">${complete ? '✓' : unlocked ? '→' : '·'}</span>
    </button>`;
  }).join('');
}

function setRegion(next) {
  if (!REGIONS[next]) return;
  regionKey = next;
  showHome();
  document.querySelectorAll('[data-region]').forEach(button => {
    button.classList.toggle('active', button.dataset.region === next);
    button.setAttribute('aria-pressed', String(button.dataset.region === next));
  });
}

function showHome() {
  clearControls();
  game = null;
  elements['game-dialog'].hidden = true;
  elements.play.hidden = true;
  elements.home.hidden = false;
  renderLevelList();
}

function createNpcs(levelId, density) {
  const traffic = [
    { type: 'east', x: 85, y: 155, angle: Math.PI / 2, speed: 52, color: '#d8e7cf' },
    { type: 'west', x: 1020, y: 205, angle: -Math.PI / 2, speed: 43, color: '#a8c9ba' },
    { type: 'ring', phase: .5, speed: 39, color: '#e2b482' },
    { type: 'bridge', x: 1010, y: 745, angle: -Math.PI / 2, speed: 36, color: '#dbcbc0' },
    { type: 'south', x: 585, y: 75, angle: Math.PI, speed: 45, color: '#c4d1e0' },
    { type: 'junction', x: 1020, y: 475, angle: -Math.PI / 2, speed: 35, color: '#b8cdb8' }
  ];
  const selected = levelId === 5 ? [traffic[2], traffic[0]]
    : levelId === 2 || levelId === 3 ? traffic.slice(0, 2)
      : levelId === 4 ? [traffic[0], traffic[1], traffic[4]]
        : traffic;
  return (density === 'low' ? selected.slice(0, Math.min(2, selected.length)) : selected).map(npc => ({
    ...npc, clock: 0, signal: null,
    x: npc.type === 'ring' ? 560 + Math.sin(npc.phase) * 80 : npc.x,
    y: npc.type === 'ring' ? 450 - Math.cos(npc.phase) * 80 : npc.y,
    angle: npc.type === 'ring' ? npc.phase + Math.PI / 2 : npc.angle
  }));
}

function startLevel(id) {
  const level = LEVELS.find(item => item.id === id);
  if (!level || id > progress[regionKey] + 1 || (id === 7 && progress[regionKey] < 6)) return;
  const density = game?.density || 'normal';
  game = {
    level, region: REGIONS[regionKey], car: { ...level.start, speed: 0, signal: null },
    input: { steer: 0, throttle: false, brake: false }, npcs: createNpcs(id, density),
    density, elapsed: 0, checkpoint: 0, violations: [], lastViolation: new Map(),
    paused: false, stopDwell: 0, offRoadTime: 0, wrongSideTime: 0, fastTime: 0,
    toastUntil: 0, turnEntry: null, completed: false
  };
  elements.home.hidden = true;
  elements.play.hidden = false;
  elements['game-dialog'].hidden = true;
  elements['play-index'].textContent = `${String(id).padStart(2, '0')} / 07 · ${game.region.code}`;
  elements['play-name'].textContent = level.title;
  elements['mission-label'].textContent = id === 7 ? '自由练习' : '前往标记点';
  elements['mission-text'].textContent = level.hint;
  elements['review-button'].hidden = id !== 7;
  elements['mini-toggle'].hidden = id !== 7;
  elements['mini-toggle'].textContent = '隐藏小地图';
  miniMap.hidden = id !== 7;
  elements['density-button'].textContent = `车流：${density === 'low' ? '低' : '标准'}`;
  elements['status-banner'].textContent = `${game.region.name}规则 · ${id === 7 ? '自由行驶' : '安全优先'}`;
  elements.toast.classList.remove('visible');
  updateSignalButtons();
  resizeCanvas();
  window.scrollTo(0, 0);
}

function showDialog(kicker, title, body, primaryLabel, primaryAction, secondaryLabel = '返回关卡', secondaryAction = showHome) {
  if (!game) return;
  game.paused = true;
  clearControls();
  elements['dialog-kicker'].textContent = kicker;
  elements['dialog-title'].textContent = title;
  elements['dialog-body'].textContent = body;
  elements['dialog-primary'].textContent = primaryLabel;
  elements['dialog-secondary'].textContent = secondaryLabel;
  dialogPrimary = primaryAction;
  dialogSecondary = secondaryAction;
  elements['game-dialog'].hidden = false;
}

function resume() {
  elements['game-dialog'].hidden = true;
  if (game) game.paused = false;
}

function reviewText() {
  if (!game) return '';
  if (!game.violations.length) return '本次还没有记录到违规。继续练习，尝试经过路口、环岛和信号灯。';
  return game.violations.slice(-12).map((event, index) => `${index + 1}. ${event.message}`).join('\n');
}

function report(code, message, serious = false) {
  if (!game || game.paused) return;
  const previous = game.lastViolation.get(code) ?? -Infinity;
  if (game.elapsed - previous < 4) return;
  game.lastViolation.set(code, game.elapsed);
  game.violations.push({ code, message, time: game.elapsed, serious });
  elements.toast.textContent = message;
  elements.toast.classList.toggle('danger', serious);
  elements.toast.classList.add('visible');
  game.toastUntil = game.elapsed + 3.5;
  if (serious && game.level.id !== 7) {
    showDialog('安全提醒', '这次先停一下', message, '重新练习', () => startLevel(game.level.id));
  }
}

function updateNpcs(delta) {
  for (const npc of game.npcs) {
    npc.clock = game.elapsed;
    const distanceStep = npc.speed * delta;
    let x = npc.x;
    let y = npc.y;
    if (npc.type === 'ring') {
      const nextPhase = npc.phase + distanceStep / 80;
      x = 560 + Math.sin(nextPhase) * 80;
      y = 450 - Math.cos(nextPhase) * 80;
      if (distance({ x, y }, game.car) > 42) npc.phase = nextPhase;
      npc.x = 560 + Math.sin(npc.phase) * 80;
      npc.y = 450 - Math.cos(npc.phase) * 80;
      npc.angle = npc.phase + Math.PI / 2;
      npc.signal = null;
      continue;
    }
    if (npc.type === 'east') {
      x += distanceStep;
      if (npc.x < 510 && x >= 510 && lightState(game.elapsed, game.region, true) !== 'green') x = 509.5;
      if (x > 1040) x = 70;
    } else if (npc.type === 'west') {
      x -= distanceStep;
      if (npc.x > 610 && x <= 610 && lightState(game.elapsed, game.region, true) !== 'green') x = 610.5;
      if (x < 60) x = 1030;
    } else if (npc.type === 'bridge') {
      x -= distanceStep;
      if (x < 60) x = 1030;
      const onBridge = clamp((x - 650) / 40, 0, 1) * clamp((810 - x) / 40, 0, 1);
      y = 745 - 25 * onBridge;
    } else if (npc.type === 'south') {
      y += distanceStep;
      if (npc.y < 132 && y >= 132 && lightState(game.elapsed, game.region) !== 'green') y = 131.5;
      if (y > 333) y = 70;
    } else if (npc.type === 'junction') {
      x -= distanceStep;
      if (x < 795) x = 1030;
    }
    if (distance({ x, y }, game.car) > 40 || Math.abs(x - npc.x) > 200) {
      npc.x = x;
      npc.y = y;
    }
  }
}

function checkSignalLine(previous) {
  const car = game.car;
  const atVertical = car.x > 510 && car.x < 610;
  const atHorizontal = car.y > 130 && car.y < 230;
  let direction = null;
  let horizontal = false;
  if (atVertical && Math.cos(car.angle) > .55 && crossed(previous, car, 'y', 228, -1)) direction = '北向';
  else if (atVertical && Math.cos(car.angle) < -.55 && crossed(previous, car, 'y', 132, 1)) direction = '南向';
  else if (atHorizontal && Math.sin(car.angle) > .55 && crossed(previous, car, 'x', 510, 1)) { direction = '东向'; horizontal = true; }
  else if (atHorizontal && Math.sin(car.angle) < -.55 && crossed(previous, car, 'x', 610, -1)) { direction = '西向'; horizontal = true; }
  if (!direction) return;
  const state = lightState(game.elapsed, game.region, horizontal);
  if (state === 'red' || state === 'redAmber') report('red-light', `${direction}信号为红灯，应在停止线前停车。`, true);
  else if (state === 'amber' && car.speed < 80) report('amber-light', '黄灯原则上应停车；仅在无法安全停下时继续。');
}

function checkJunction(previous, delta) {
  const car = game.car;
  const northboundAtT = car.x > 160 && car.x < 210 && Math.cos(car.angle) > .55;
  if (northboundAtT && car.y > 230 && car.y < 285 && car.speed < 7) game.stopDwell += delta;
  if (car.y > 315 || car.x > 235) game.stopDwell = 0;
  if (northboundAtT && crossed(previous, car, 'y', 229, -1)) {
    if (game.level.id === 3) {
      if (nearbyNpc(game.npcs.filter(npc => npc.type === 'east' || npc.type === 'west'), { x: 210, y: 180 }, 125)) {
        report('give-way', 'GIVE WAY：先让主路车辆通过，确认安全间隙后再转。', true);
      }
    } else if (game.stopDwell < .3) report('stop', `STOP：应在${game.region.code === 'NZ' ? '黄线' : '停车线'}前完全停稳，观察双向来车再通行。`, true);
    game.stopDwell = 0;
  }
  if (car.x > 875 && car.x < 925 && Math.cos(car.angle) < -.55 && crossed(previous, car, 'y', 405, 1)) {
    if (nearbyNpc(game.npcs, { x: 900, y: 450 }, 90)) report('east-give-way', 'GIVE WAY：这里应先让主路车辆通过。', true);
  }
  if (car.x > 500 && car.x < 555 && Math.cos(car.angle) > .55 && crossed(previous, car, 'y', 565, -1)) {
    const onCircle = game.npcs.filter(npc => npc.type === 'ring');
    if (nearbyNpc(onCircle, { x: 510, y: 520 }, 70)) report('roundabout-give', '进入环岛前，应让行已经接近的环岛车辆。', true);
  }
  if (game.region.bridge && car.y > 685 && car.y < 750 && Math.sin(car.angle) > .55 && crossed(previous, car, 'x', 680, 1)) {
    if (game.npcs.some(npc => npc.type === 'bridge' && npc.x > 670 && npc.x < 830)) {
      report('bridge', '单车道桥梁：先看优先通行标志，让对向来车通过。', true);
    }
  }
}

function angleDifference(first, second) {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}

function checkTurning(previous) {
  const junctions = [{ x: 210, y: 180 }, { x: 560, y: 180 }, { x: 900, y: 450 }];
  const nearby = junctions.find(point => distance(point, game.car) < 83);
  if (nearby) {
    if (!game.turnEntry) game.turnEntry = { point: nearby, angle: previous.angle, signal: game.car.signal, checkedRight: false };
    if (game.car.signal) game.turnEntry.signal = game.car.signal;
    const turnAmount = angleDifference(game.car.angle, game.turnEntry.angle);
    if (nearby.x === 560 && turnAmount > .45 && !game.turnEntry.checkedRight) {
      game.turnEntry.checkedRight = true;
      if (game.npcs.some(npc => npc.type === 'south' && distance(npc, nearby) < 85)) {
        report('oncoming', '右转横穿路口前，应让对向直行车辆通过。', true);
      }
    }
  } else if (game.turnEntry && distance(game.turnEntry.point, game.car) > 92) {
    const change = angleDifference(game.car.angle, game.turnEntry.angle);
    if (Math.abs(change) > .65) {
      const expected = change > 0 ? 'right' : 'left';
      if (game.turnEntry.signal !== expected) report('indicator', `转弯前请提前打${expected === 'left' ? '左' : '右'}转向灯。`);
      game.car.signal = null;
      updateSignalButtons();
    }
    game.turnEntry = null;
  }
  const center = WORLD.roundabout;
  if (distance(previous, center) < 114 && distance(game.car, center) >= 114 && game.car.speed > 15) {
    if (game.car.signal !== 'left') report('exit-signal', '驶离环岛前请提前打左转向灯。');
    game.car.signal = null;
    updateSignalButtons();
  }
}

function checkDriving(previous, delta) {
  const car = game.car;
  if (!isOnRoad(car) && car.speed > 20) game.offRoadTime += delta;
  else game.offRoadTime = 0;
  if (game.offRoadTime > .6) { report('off-road', '请回到道路范围内，沿左侧车道行驶。'); game.offRoadTime = 0; }
  if (car.speed > 18 && wrongSide(car, car.angle)) game.wrongSideTime += delta;
  else game.wrongSideTime = 0;
  if (game.wrongSideTime > 1.1) { report('wrong-side', '你驶入了对向车道；新西兰和英国都要靠左行驶。', true); game.wrongSideTime = 0; }
  if (car.speed > 124) game.fastTime += delta;
  else game.fastTime = 0;
  if (game.fastTime > 1.2) { report('speed', '减速观察路况，练习不以用时计分。'); game.fastTime = 0; }
  checkSignalLine(previous);
  if (game.paused) return;
  checkJunction(previous, delta);
  if (game.paused) return;
  checkTurning(previous);
  if (game.paused) return;
  for (const npc of game.npcs) {
    if (distance(car, npc) < 24) {
      report(`collision-${npc.type}`, '与其他车辆发生碰撞。真实驾驶中必须停车确认安全。', true);
      break;
    }
  }
}

function updateCheckpoints() {
  if (game.level.id === 7 || game.paused) return;
  const target = game.level.checkpoints[game.checkpoint];
  if (!target || distance(game.car, target) > 35) return;
  game.checkpoint += 1;
  if (game.checkpoint < game.level.checkpoints.length) {
    elements['mission-text'].textContent = `${game.level.hint} · ${game.checkpoint + 1}/${game.level.checkpoints.length}`;
    return;
  }
  game.completed = true;
  progress[regionKey] = Math.max(progress[regionKey], game.level.id);
  saveProgress();
  showDialog('练习完成', '安全抵达', `完成「${game.level.title}」。${game.violations.length ? `本次有 ${game.violations.length} 条提示，可再练一次。` : '这次没有记录到违规。'}\n${game.level.id === 6 ? '自由练习小镇已解锁。' : '下一关已解锁。'}`,
    game.level.id === 6 ? '进入自由练习' : '下一关',
    () => startLevel(Math.min(7, game.level.id + 1)), '返回关卡', showHome);
}

function update(delta) {
  if (!game || game.paused) return;
  game.elapsed += delta;
  const previous = { x: game.car.x, y: game.car.y, angle: game.car.angle };
  steeringStep(game.car, game.input, delta);
  updateNpcs(delta);
  checkDriving(previous, delta);
  if (!game.paused) updateCheckpoints();
  if (game.elapsed >= game.toastUntil) elements.toast.classList.remove('visible');
  elements.speed.textContent = String(Math.round(game.car.speed * .38));
}

function resizeCanvas() {
  if (!game) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  for (const target of [canvas, miniMap]) {
    const rectangle = target.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) continue;
    const width = Math.round(rectangle.width * ratio);
    const height = Math.round(rectangle.height * ratio);
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    target.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function frame(timestamp) {
  const delta = Math.min((timestamp - (lastFrame || timestamp)) / 1000, .05);
  lastFrame = timestamp;
  if (game) {
    resizeCanvas();
    update(delta);
    const rectangle = canvas.getBoundingClientRect();
    render(context, game, rectangle.width, rectangle.height);
    if (game.level.id === 7) {
      const miniRectangle = miniMap.getBoundingClientRect();
      renderMiniMap(miniContext, game, miniRectangle.width, miniRectangle.height);
    }
  }
  requestAnimationFrame(frame);
}

function updateSignalButtons() {
  const active = game?.car.signal;
  elements['signal-left'].classList.toggle('active', active === 'left');
  elements['signal-right'].classList.toggle('active', active === 'right');
  elements['signal-left'].setAttribute('aria-pressed', String(active === 'left'));
  elements['signal-right'].setAttribute('aria-pressed', String(active === 'right'));
}

function toggleSignal(direction) {
  if (!game || game.paused) return;
  game.car.signal = game.car.signal === direction ? null : direction;
  updateSignalButtons();
}

function clearControls() {
  if (!game) return;
  game.input.throttle = false;
  game.input.brake = false;
  game.input.steer = 0;
  elements.throttle.classList.remove('pressed');
  elements.brake.classList.remove('pressed');
  setSteer(0);
}

function setSteer(value) {
  const steering = clamp(value, -1, 1);
  if (game) game.input.steer = steering;
  elements['steer-knob'].style.left = `${50 + steering * 39}%`;
  elements['steer-track'].setAttribute('aria-valuenow', String(Math.round(steering * 100)));
}

function bindPedal(element, name) {
  element.addEventListener('pointerdown', event => {
    if (!game || game.paused) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    game.input[name] = true;
    element.classList.add('pressed');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(type, () => {
      if (game) game.input[name] = false;
      element.classList.remove('pressed');
    });
  }
}

function bindControls() {
  const track = elements['steer-track'];
  const updatePointer = event => {
    const bounds = track.getBoundingClientRect();
    setSteer(((event.clientX - bounds.left) / bounds.width - .5) * 2.3);
  };
  track.addEventListener('pointerdown', event => {
    if (!game || game.paused) return;
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
    updatePointer(event);
  });
  track.addEventListener('pointermove', event => {
    if (track.hasPointerCapture(event.pointerId)) updatePointer(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) track.addEventListener(type, () => setSteer(0));
  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setSteer((game?.input.steer || 0) + (event.key === 'ArrowLeft' ? -.2 : .2));
    }
  });
  bindPedal(elements.throttle, 'throttle');
  bindPedal(elements.brake, 'brake');
  elements['signal-left'].addEventListener('click', () => toggleSignal('left'));
  elements['signal-right'].addEventListener('click', () => toggleSignal('right'));
  document.addEventListener('keydown', event => {
    if (!game || game.paused || event.repeat && (event.key.toLowerCase() === 'q' || event.key.toLowerCase() === 'e')) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(key)) event.preventDefault();
    if (key === 'arrowup' || key === 'w') game.input.throttle = true;
    if (key === 'arrowdown' || key === 's' || key === ' ') game.input.brake = true;
    if (key === 'arrowleft' || key === 'a') setSteer(-1);
    if (key === 'arrowright' || key === 'd') setSteer(1);
    if (key === 'q') toggleSignal('left');
    if (key === 'e') toggleSignal('right');
  });
  document.addEventListener('keyup', event => {
    if (!game) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') game.input.throttle = false;
    if (key === 'arrowdown' || key === 's' || key === ' ') game.input.brake = false;
    if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) setSteer(0);
  });
  window.addEventListener('blur', clearControls);
}

function bindPage() {
  elements['level-list'].addEventListener('click', event => {
    const button = event.target.closest('[data-level]');
    if (button && !button.disabled) startLevel(Number(button.dataset.level));
  });
  document.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => setRegion(button.dataset.region)));
  elements['home-button'].addEventListener('click', showHome);
  elements['back-button'].addEventListener('click', showHome);
  elements['restart-button'].addEventListener('click', () => { if (game) startLevel(game.level.id); });
  elements['pause-button'].addEventListener('click', () => {
    if (game && !game.paused) showDialog('练习暂停', '慢一点，继续就好', '随时可以继续，也可以重来。', '继续驾驶', resume);
  });
  elements['dialog-primary'].addEventListener('click', () => dialogPrimary());
  elements['dialog-secondary'].addEventListener('click', () => dialogSecondary());
  elements['review-button'].addEventListener('click', () => {
    if (game?.level.id === 7) showDialog('本次练习', `${game.violations.length} 条提示`, reviewText(), '继续驾驶', resume);
  });
  elements['mini-toggle'].addEventListener('click', () => {
    miniMap.hidden = !miniMap.hidden;
    elements['mini-toggle'].textContent = miniMap.hidden ? '显示小地图' : '隐藏小地图';
  });
  elements['density-button'].addEventListener('click', () => {
    if (!game) return;
    game.density = game.density === 'normal' ? 'low' : 'normal';
    game.npcs = createNpcs(game.level.id, game.density);
    elements['density-button'].textContent = `车流：${game.density === 'low' ? '低' : '标准'}`;
  });
  window.addEventListener('resize', resizeCanvas);
}

async function registerOffline() {
  if (!('serviceWorker' in navigator)) {
    elements['offline-status'].textContent = '当前浏览器不支持离线缓存';
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    elements['offline-status'].textContent = '离线资源已就绪';
  } catch (error) {
    console.warn('离线资源尚未准备好，请保持联网后重试。', error);
    elements['offline-status'].textContent = '离线资源尚未就绪';
  }
}

bindControls();
bindPage();
setRegion(regionKey);
registerOffline();
requestAnimationFrame(frame);
