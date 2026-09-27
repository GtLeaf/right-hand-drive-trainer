import { BRIDGE, COMPLEX_T, CONTROL_POINTS, CROSSING, JUNCTIONS, LEVELS, REGIONS, SIGNAL_APPROACHES, WORLD } from './data.js';
import { clamp, crossesControl, distance, inBridgeCorridor, inComplexMedian, complexTrafficConflict, isOnRoad, signalApproachForCar, signalForApproach, steeringStep, wrongSide, crossesFront, frontPoint, updateStop, signalMustStop, rightArrowState, junctionMovement, junctionConflict, angleDelta, turnFrom, recordIndicator, roundaboutConflict, roundaboutEvents, createPedestrians, updatePedestrians, crossingControl, pedestriansHavePriority, pedestrianCollision } from './rules.js';
import { createNpcs, updateNpcs } from './npc.js';
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
const STORAGE_KEY = 'right-side-ready-progress-v2';
const LEGACY_STORAGE_KEY = 'right-side-ready-progress-v1';
const TEACHING_LEVEL_COUNT = LEVELS.filter(level => !level.free).length;
let regionKey = 'nz';
let progress = readProgress();
let game = null;
let lastFrame = 0;
let dialogPrimary = () => {};
let dialogSecondary = () => {};

function readProgress() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const saved = JSON.parse(current);
      return { nz: clamp(Number(saved.nz) || 0, 0, TEACHING_LEVEL_COUNT), uk: clamp(Number(saved.uk) || 0, 0, TEACHING_LEVEL_COUNT) };
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
    const migrate = value => {
      const completed = clamp(Number(value) || 0, 0, 6);
      return completed >= 6 ? TEACHING_LEVEL_COUNT : completed;
    };
    const migrated = { nz: migrate(legacy.nz), uk: migrate(legacy.uk) };
    if (legacy.nz !== undefined || legacy.uk !== undefined) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
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
    const unlocked = level.free ? progress[regionKey] >= TEACHING_LEVEL_COUNT : level.id <= progress[regionKey] + 1;
    const complete = !level.free && level.id <= progress[regionKey];
    return `<button class="level-card ${level.free ? 'free' : ''}" type="button" data-level="${level.id}" ${unlocked ? '' : 'disabled'}>
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

function startLevel(id) {
  const level = LEVELS.find(item => item.id === id);
  if (!level || (level.free ? progress[regionKey] < TEACHING_LEVEL_COUNT : id > progress[regionKey] + 1)) return;
  const density = game?.density || 'normal';
  game = {
    level, region: REGIONS[regionKey], car: { ...level.start, speed: 0, signal: null, signalSince: 0 },
    input: { steer: 0, throttle: false, brake: false }, npcs: createNpcs(id, density, REGIONS[regionKey]),
    pedestrians: createPedestrians(), stopState: {}, signalMemory: {}, roundaboutState: {},
    density, elapsed: 0, checkpoint: 0, violations: [], lastViolation: new Map(),
    paused: false, offRoadTime: 0, wrongSideTime: 0, fastTime: 0,
    toastUntil: 0, turnEntry: null, completed: false, complexStage: level.scenario === 'complex-t' || level.free ? 'approach' : null,
    complexMedianDwell: 0, complexMedianReady: false
  };
  elements.home.hidden = true;
  elements.play.hidden = false;
  elements['game-dialog'].hidden = true;
  elements['play-index'].textContent = `${String(id).padStart(2, '0')} / ${String(LEVELS.length).padStart(2, '0')} · ${game.region.code}`;
  elements['play-name'].textContent = level.title;
  elements['mission-label'].textContent = level.free ? '自由练习' : '前往标记点';
  elements['mission-text'].textContent = level.hint;
  elements['review-button'].hidden = !level.free;
  elements['mini-toggle'].hidden = !level.free;
  elements['mini-toggle'].textContent = '隐藏小地图';
  miniMap.hidden = !level.free;
  elements['density-button'].textContent = `车流：${density === 'low' ? '低' : '标准'}`;
  elements['status-banner'].textContent = `${game.region.name}规则 · ${level.free ? '自由行驶' : '安全优先'}`;
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
  if (serious && !game.level.free) {
    showDialog('安全提醒', '这次先停一下', message, '重新练习', () => startLevel(game.level.id));
  }
}

function checkSignalLine(previous) {
  const car = game.car;
  for (const approach of SIGNAL_APPROACHES) {
    const turn = car.signal === 'right' ? 'right' : 'straight';
    const memory = game.signalMemory[approach.id] ||= {};
    // 只更新本车正在接近的灯号，保存黄灯刚亮时的停车条件。
    if (signalApproachForCar(previous)?.id === approach.id || crossesFront(previous, car, approach)) {
      const stop = signalMustStop(previous, approach, game.elapsed, game.region, turn, memory);
      if (crossesFront(previous, car, approach)) {
        game.signalEntry = { approach, time: game.elapsed, arrow: rightArrowState(game.elapsed, game.region, approach) };
        if (stop) report(memory.state === 'amber' ? 'amber-light' : 'red-light', memory.state === 'amber'
          ? '黄灯亮起时有足够距离安全停车，请在线前停下。'
          : `${approach.name}信号禁止当前方向通行，请在停止线前停车。`, true);
      }
    }
  }
}

function complexLevelActive() {
  return game?.level.scenario === 'complex-t' || game?.level.free;
}

function complexMainConflict(stage = 'entry') {
  return complexTrafficConflict(game.npcs, stage);
}

function complexMedianOccupied() {
  return game.npcs.some(npc => inComplexMedian(npc));
}

function checkComplexJunction(previous, delta) {
  if (!complexLevelActive()) return;
  const car = game.car;
  const give = CONTROL_POINTS.find(point => point.id === 'complex-give');
  if (crossesFront(previous, car, give)) {
    game.complexStage = car.x < COMPLEX_T.branchLaneDividerX ? 'give-way' : 'left-turn';
    if (car.speed > 60) report('complex-approach-speed', '接近 GIVE WAY 要先减速，确认主路有安全间隙。');
    if (complexMainConflict()) report('complex-give-way', 'GIVE WAY：主路车辆有优先权，请在让行线前等待。', true);
  }
  if (game.complexStage === 'give-way' && inComplexMedian(car)) {
    game.complexStage = 'median-wait';
    game.complexMedianDwell = 0;
    game.complexMedianReady = false;
    if (car.speed > 36) report('complex-median-speed', '进入 Flush Median 后先停稳，再观察另一方向。');
    if (complexMedianOccupied()) report('complex-median-occupied', '中央等待区或出口有车，请先留在让行位置。', true);
  }
  if (game.complexStage === 'give-way' && car.y > COMPLEX_T.y + COMPLEX_T.medianWidth / 2) {
    report('complex-no-median', '右转练习请先进入中央等待区，确认安全后再汇入主路。', true);
    game.complexStage = 'completed';
  }
  if (game.complexStage !== 'median-wait') return;
  if (inComplexMedian(car)) {
    if (car.speed < 8) {
      game.complexMedianDwell += delta;
      if (game.complexMedianDwell >= .25) game.complexMedianReady = true;
    } else {
      game.complexMedianDwell = 0;
      if (car.speed > 30) report('complex-median-speed', '中央等待区不是加速穿越区，请停稳观察。');
    }
    return;
  }
  const leftMedian = inComplexMedian(previous) && !inComplexMedian(car);
  if (!leftMedian) return;
  if (!game.complexMedianReady) report('complex-no-wait', '进入中央等待区后要先停稳，确认另一方向安全。', true);
  else if (complexMainConflict('exit')) report('complex-exit', '完成第二段右转前，应再次让行主路车辆。', true);
  else game.complexStage = 'completed';
}

function checkJunction(previous, delta) {
  const car = game.car;
  const stop = CONTROL_POINTS.find(point => point.id === 'stop-t');
  const give = CONTROL_POINTS.find(point => point.id === 'give-t');
  updateStop(game.stopState, car, stop, delta);
  if (crossesFront(previous, car, stop)) {
    if (!game.stopState.stopped) report('stop', `STOP：请在${game.region.code === 'NZ' ? '黄线' : '停车线'}前完全停稳，不能低速滑行通过。`, true);
    else if (junctionConflict(car, JUNCTIONS.find(item => item.id === 'stop-t'), game.npcs, game.region)) {
      report('stop-give-way', 'STOP：停稳后仍需让主路来车，确认安全间隙再起步。', true);
    }
    game.stopState = {};
  }
  if (!complexLevelActive() && crossesFront(previous, car, give)
    && junctionConflict(car, JUNCTIONS.find(item => item.id === 'give-t'), game.npcs, game.region)) {
    report('give-way', 'GIVE WAY：先让有冲突的主路车辆通过。', true);
  }
  checkComplexJunction(previous, delta);
  if (game.paused) return;
  for (const control of CONTROL_POINTS.filter(point => point.type === 'round-give')) {
    if (!crossesFront(previous, car, control)) continue;
    if (roundaboutConflict(car, control, game.npcs)) report('roundabout-give', '进入环岛前，请让右侧即将经过入口的环内车辆先行。', true);
  }
  if (game.region.bridge && CONTROL_POINTS.filter(point => point.type.startsWith('bridge-')).some(point => crossesControl(previous, car, point))) {
    const onBridge = game.npcs.some(inBridgeCorridor);
    const opposing = car.angle > 0 && car.angle < Math.PI && game.npcs.some(npc => npc.route.id === 'lower-west'
      && npc.x > BRIDGE.to && npc.x < BRIDGE.to + 100 && Math.abs(npc.y - BRIDGE.y) < 70);
    if (onBridge || opposing) report('bridge', '单车道桥梁：先看优先通行标志，让对向来车通过。', true);
  }
}

function checkTurning(previous) {
  const car = game.car;
  const junctions = JUNCTIONS.filter(junction => !['roundabout', 'corner'].includes(junction.type)
    && !(complexLevelActive() && junction.id === 'give-t'));
  if (!game.turnEntry) {
    const point = junctions.find(junction => distance(car, junction) < 150 && junctionMovement(car, junction).approaching);
    if (point) game.turnEntry = { point, angle: junctionMovement(car, point).heading, checkedTurn: false };
  }
  const entry = game.turnEntry;
  if (entry) {
    const change = angleDelta(entry.angle, car.angle);
    const radius = distance(car, entry.point);
    const turn = turnFrom(entry.angle, car.angle);
    const movement = { heading: entry.angle, approaching: true, turn: turn === 'straight' ? car.signal || 'straight' : turn };
    car.movement = { ...movement, junctionId: entry.point.id };
    if (Math.abs(change) > .35 && radius < entry.point.radius + 8) {
      if (!entry.checkedTurn) {
        entry.checkedTurn = true;
        const expected = change > 0 ? 'right' : 'left';
        if (car.signal !== expected) report('indicator', `转弯前请打${expected === 'left' ? '左' : '右'}转向灯。`);
        else if (game.region.code === 'NZ' && game.elapsed - (car.signalSince ?? game.elapsed) < 3) report('indicator-late', '转弯前应至少提前 3 秒打转向灯。');
        if (entry.point.id === 'signal' && turn === 'right' && game.signalEntry?.arrow === 'red') {
          report('red-arrow', '右转箭头为红色时不能右转，即使圆形绿灯亮起也要等待。', true);
        }
      }
      if (entry.point.id === 'signal' && turn === 'right' && junctionConflict(car, entry.point, game.npcs, game.region, movement, game.elapsed)) {
        report('oncoming', '右转前应让对向直行和左转车辆通过，绿灯也不代表可以抢行。', true);
      }
    }
    if (['west-middle', 'north-east', 'south-middle', 'east-middle'].includes(entry.point.id) && game.region.code === 'NZ' && radius < 72
      && distance(previous, entry.point) >= 72 && junctionConflict(car, entry.point, game.npcs, game.region, movement, game.elapsed)) {
      report('uncontrolled-give', '无信号路口：按转弯让直行及右侧来车规则，让有冲突的车辆先行。', true);
    }
    const outward = !junctionMovement(car, entry.point).approaching;
    if (radius > entry.point.radius + 28 && outward) {
      if (wrongSide(car, car.angle, complexLevelActive(), game.region)) report('turn-lane', '转弯后应驶入左侧车道，请勿进入对向车道。', true);
      if (entry.checkedTurn) { car.signal = null; updateSignalButtons(); }
      game.turnEntry = null; car.movement = null; game.signalEntry = null;
    } else if (radius > 200) { game.turnEntry = null; car.movement = null; }
  }
  const messages = {
    'round-wrong-way': '环岛内必须顺时针行驶，不能逆向绕行。',
    'round-entry-signal': '环岛示意：左转提前打左灯，直行入环不打灯，右转提前打右灯。',
    'round-entry-late': '进入环岛前，左转或右转应至少提前 3 秒示意。',
    'exit-signal': '驶离环岛前，请提前打左转向灯。',
    'round-exit-early': '请通过目标出口的前一个出口后，再打左灯驶出，避免误导来车。'
  };
  const events = roundaboutEvents(game.roundaboutState, previous, car, game.elapsed, game.region);
  for (const code of events) report(code, messages[code], code === 'round-wrong-way');
  const radius = distance(car, WORLD.roundabout);
  if (!game.roundaboutState.active && radius > 134 && distance(previous, WORLD.roundabout) <= 134) {
    car.signal = null; updateSignalButtons();
  }
}

function checkPedestrians(previous) {
  const car = game.car, control = crossingControl(car);
  if (control && crossesFront(previous, car, control) && pedestriansHavePriority(game.pedestrians)) {
    report('pedestrian-yield', '斑马线有人等待或正在过街，请在线前停车让行。', true);
  }
  if (game.pedestrians.some(person => pedestrianCollision(car, person))) report('pedestrian-collision', '车身接触了过街行人，请停车并留足空间。', true);
  const front = frontPoint(car);
  if (car.speed <= .1 && Math.abs(car.y - CROSSING.y) < 47
    && Math.max(car.x, front.x) >= CROSSING.x && Math.min(car.x, front.x) <= CROSSING.x + CROSSING.width) {
    report('crossing-blocked', '请把斑马线留给行人，不要停在过街区域内。');
  }
}

function checkDriving(previous, delta) {
  const car = game.car;
  recordIndicator(car, game.elapsed);
  checkPedestrians(previous);
  if (game.paused) return;
  if (!isOnRoad(car, game.region, complexLevelActive()) && car.speed > 20) game.offRoadTime += delta;
  else game.offRoadTime = 0;
  if (game.offRoadTime > .6) { report('off-road', '请回到道路范围内，沿左侧车道行驶。'); game.offRoadTime = 0; }
  if (car.speed > .5 && wrongSide(car, car.angle, complexLevelActive(), game.region)) game.wrongSideTime += delta;
  else game.wrongSideTime = 0;
  if (game.wrongSideTime > .45) { report('wrong-side', '你驶入了对向车道；新西兰和英国都要靠左行驶。', true); game.wrongSideTime = 0; }
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
      report(`collision-${npc.id}`, '与其他车辆发生碰撞。真实驾驶中必须停车确认安全。', true);
      break;
    }
  }
}

function updateCheckpoints() {
  if (game.level.free || game.paused) return;
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
  const unlockedFree = game.level.id === TEACHING_LEVEL_COUNT;
  showDialog('练习完成', '安全抵达', `完成「${game.level.title}」。${game.violations.length ? `本次有 ${game.violations.length} 条提示，可再练一次。` : '这次没有记录到违规。'}\n${unlockedFree ? '自由练习小镇已解锁。' : '下一关已解锁。'}`,
    unlockedFree ? '进入自由练习' : '下一关',
    () => startLevel(Math.min(LEVELS.length, game.level.id + 1)), '返回关卡', showHome);
}

function update(delta) {
  if (!game || game.paused) return;
  game.elapsed += delta;
  const previous = { ...game.car };
  recordIndicator(game.car, game.elapsed);
  steeringStep(game.car, game.input, delta);
  updatePedestrians(game.pedestrians, delta, [game.car, ...game.npcs]);
  updateNpcs(game.npcs, delta, game.elapsed, game.region, game.car, game.pedestrians);
  checkDriving(previous, delta);
  if (!game.paused) updateCheckpoints();
  if (game.elapsed >= game.toastUntil) elements.toast.classList.remove('visible');
  elements.speed.textContent = String(Math.round(game.car.speed * .38));
  const approachingSignal = signalApproachForCar(game.car);
  const colors = { red: '红灯', redAmber: '红黄灯 · 停车', amber: '黄灯', green: '绿灯' };
  elements['status-banner'].textContent = approachingSignal
    ? `${game.region.name} · 前方${approachingSignal.name}信号：${colors[signalForApproach(game.elapsed, game.region, approachingSignal)]}${game.region.code === 'NZ' ? ' · 右转：' + ({ off: '让行后转弯', red: '红箭头', amber: '黄箭头', green: '绿箭头' }[rightArrowState(game.elapsed, game.region, approachingSignal)]) : ''}`
    : `${game.region.name}规则 · ${game.level.free ? '自由行驶' : '安全优先'}`;
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
    if (game.level.free) {
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
  recordIndicator(game.car, game.elapsed);
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
  document.getElementById('app').addEventListener('contextmenu', event => {
    if (window.matchMedia('(pointer: coarse)').matches) event.preventDefault();
  });
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
    if (game?.level.free) showDialog('本次练习', `${game.violations.length} 条提示`, reviewText(), '继续驾驶', resume);
  });
  elements['mini-toggle'].addEventListener('click', () => {
    miniMap.hidden = !miniMap.hidden;
    elements['mini-toggle'].textContent = miniMap.hidden ? '显示小地图' : '隐藏小地图';
  });
  elements['density-button'].addEventListener('click', () => {
    if (!game) return;
    game.density = game.density === 'normal' ? 'low' : 'normal';
    elements['density-button'].textContent = `车流：${game.density === 'low' ? '低' : '标准'}（重开生效）`;
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
