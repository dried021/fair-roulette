const STORAGE_KEY = "fair-roulette-state-v1";
const PRIZE_RATE_TABLE = {
  default: { 1: 0.2, 2: 4.8, 3: 15, 4: 35, 5: 45 },
  afterRank5Once: { 1: 0.2, 2: 4.8, 3: 15, 4: 45, 5: 35 },
  afterRank5Twice: { 1: 0.2, 2: 4.8, 3: 35, 4: 60, 5: 0 },
  afterRank4Twice: { 1: 0.2, 2: 4.8, 3: 50, 4: 0, 5: 45 },
  testEqual: { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20 }
};

const defaultState = {
  prizes: [
    { id: 1, name: "키링 1개 선택 + 씰스티커 4장 세트 + 모조지 세트", rank: 1, angle: -90 },
    { id: 2, name: "키링 1개 선택 + 씰스티커 1장 선택", rank: 2, angle: -52.5 },
    { id: 3, name: "씰스티커 1장 선택", rank: 3, angle: 2.5 },
    { id: 4, name: "모조지 세트", rank: 4, angle: 80 },
    { id: 5, name: "미니 씰스티커 랜덤 1장", rank: 5, angle: 190 }
  ],
  pity: {
    enabled: true,
    maxFailCount: 15,
    guaranteedRank: 3
  },
  failCount: 0,
  currentRotation: 0,
  customerRanks: [],
  testEqualRates: false,
  logs: []
};

let state = loadState();
let isSpinning = false;

const wheel = document.getElementById("wheel");
const rouletteArea = document.getElementById("rouletteArea");
const centerButton = document.getElementById("centerButton");
const resultModal = document.getElementById("resultModal");
const resultPrize = document.getElementById("resultPrize");
const closeResultBtn = document.getElementById("closeResultBtn");
const celebrateOverlay = document.getElementById("celebrateOverlay");
const celebrateGif = document.getElementById("celebrateGif");

const adminHotspot = document.getElementById("adminHotspot");
const adminModal = document.getElementById("adminModal");
const closeAdminBtn = document.getElementById("closeAdminBtn");
const saveAdminBtn = document.getElementById("saveAdminBtn");
const resetLogsBtn = document.getElementById("resetLogsBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

const pityEnabled = document.getElementById("pityEnabled");
const prizeEditor = document.getElementById("prizeEditor");
const winnerLogList = document.getElementById("winnerLogList");
const adminLog = document.getElementById("adminLog");

let pointerDown = false;
let startX = 0;
let startY = 0;
let startTime = 0;
let centerTapCount = 0;
let centerTapTimer = null;
let hotspotTapCount = 0;
let hotspotTimer = null;
let testHotspotTapCount = 0;
let testHotspotTimer = null;

init();

function init() {
  renderWheelRotation();
  renderWinnerLog();
  bindGesture();
  bindAdmin();
  bindTestHotspot();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(savedState) {
  const nextState = { ...structuredClone(defaultState), ...savedState };
  const savedPrizes = Array.isArray(savedState.prizes) ? savedState.prizes : [];

  nextState.prizes = defaultState.prizes.map((defaultPrize) => {
    const savedPrize = savedPrizes.find((p) => Number(p.id) === defaultPrize.id);

    return {
      ...defaultPrize,
      name: savedPrize?.name || defaultPrize.name
    };
  });
  nextState.testEqualRates = Boolean(savedState.testEqualRates);

  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindGesture() {
  rouletteArea.addEventListener("pointerdown", (e) => {
    if (isSpinning) return;
    pointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
  });

  rouletteArea.addEventListener("pointerup", (e) => {
    if (!pointerDown || isSpinning) return;

    pointerDown = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = Math.max(Date.now() - startTime, 1);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = distance / dt;

    if (distance <= 20 && isInsideCenterButton(e.clientX, e.clientY)) {
      registerCenterTap();
      return;
    }

    if (distance > 50 && velocity > 0.25) {
      spinRoulette();
    }
  });

  rouletteArea.addEventListener("pointercancel", () => {
    pointerDown = false;
  });
}


function spinRoulette() {
  if (isSpinning) return;

  resultModal.classList.remove("specialWin");

  const correction = getCurrentPrizeCorrection();
  const prize = pickPrize(correction.rates);
  if (!prize) {
    alert("당첨 가능한 상품이 없습니다. 관리자 설정을 확인하세요.");
    return;
  }

  logPrizeCorrection(correction, prize);

  isSpinning = true;

  const fullSpins = randomInt(6, 9) * 360;
  // 포인터가 12시 방향이므로 기준각은 -90도
  const targetAngle = normalizeAngle(-90 - prize.angle);
  // 현재 회전값에서 목표 각도까지 가는 차이만 더해야 함
  const currentAngle = normalizeAngle(state.currentRotation);
  const deltaAngle = normalizeAngle(targetAngle - currentAngle);

  // 경계 넘지 않게 약하게 흔들림
  const jitter = getSafeStopJitter(prize);

  const nextRotation = state.currentRotation + fullSpins + deltaAngle + jitter;

  wheel.style.transition = "transform 4.2s cubic-bezier(0.12, 0.72, 0.08, 1)";
  wheel.style.transform = `rotate(${nextRotation}deg)`;

  setTimeout(() => {
    state.currentRotation = nextRotation % 360;

    applyPrizeResult(prize);
    saveState();
    renderWinnerLog();

    resultPrize.textContent = prize.name;

    wheel.style.transition = "none";
    renderWheelRotation();

    setTimeout(() => {
      resultModal.classList.toggle("specialWin", Number(prize.rank) <= 3);
      resultModal.classList.remove("hidden");
      if (Number(prize.rank) <= 3) {
        showCelebrateOverlay();
      }
      isSpinning = false;
    }, 500);
  }, 4300);
}

function pickPrize(rates = getCurrentPrizeRates()) {
  const available = state.prizes.filter((p) => Number(rates[p.rank]) > 0);

  if (available.length === 0) return null;

  const pityHit =
    !state.testEqualRates &&
    state.pity.enabled &&
    state.failCount + 1 >= Number(state.pity.maxFailCount);

  if (pityHit) {
    const guaranteed = available
      .filter((p) => Number(p.rank) <= Number(state.pity.guaranteedRank))
      .sort((a, b) => a.rank - b.rank);

    if (guaranteed.length > 0) {
      return pickByRates(guaranteed, rates);
    }
  }

  return pickByRates(available, rates);
}

function pickByRates(list, rates) {
  const total = list.reduce((sum, p) => sum + Number(rates[p.rank] || 0), 0);
  let r = Math.random() * total;

  for (const p of list) {
    r -= Number(rates[p.rank] || 0);
    if (r <= 0) return p;
  }

  return list[list.length - 1];
}

function applyPrizeResult(prize) {
  if (Number(prize.rank) <= Number(state.pity.guaranteedRank)) {
    state.failCount = 0;
  } else {
    state.failCount += 1;
  }

  state.logs.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    rank: prize.rank,
    time: formatLogTime(new Date())
  });

  state.logs = state.logs.slice(0, 100);
  state.customerRanks = [...(state.customerRanks || []), Number(prize.rank)].slice(-2);
}

function renderWinnerLog() {
  const winners = state.logs
    .filter((log) => Number(log.rank) <= 3)
    .slice(0, 5);

  winnerLogList.innerHTML = winners.length
    ? winners.map((log) => `<li>${escapeHtml(formatLogTimeValue(log.time))} / ${escapeHtml(formatRank(log.rank))}</li>`).join("")
    : `<li>아직 없음</li>`;
}

closeResultBtn.addEventListener("click", () => {
  resultModal.classList.add("hidden");
  resultModal.classList.remove("specialWin");
  hideCelebrateOverlay();
});

function bindAdmin() {
  adminHotspot.addEventListener("click", () => {
    hotspotTapCount += 1;

    clearTimeout(hotspotTimer);
    hotspotTimer = setTimeout(() => {
      hotspotTapCount = 0;
    }, 1500);

    if (hotspotTapCount >= 5) {
      hotspotTapCount = 0;
      openAdmin();
    }
  });

  closeAdminBtn.addEventListener("click", () => {
    adminModal.classList.add("hidden");
  });

  saveAdminBtn.addEventListener("click", () => {
    saveAdminFromInputs();
    saveState();
    renderWinnerLog();
    openAdmin();
    alert("저장되었습니다.");
  });

  resetLogsBtn.addEventListener("click", () => {
    if (!confirm("로그를 초기화할까요?")) return;
    state.logs = [];
    state.failCount = 0;
    state.customerRanks = [];
    saveState();
    renderWinnerLog();
    openAdmin();
  });

  resetAllBtn.addEventListener("click", () => {
    if (!confirm("전체 데이터를 초기화할까요?")) return;
    state = structuredClone(defaultState);
    saveState();
    renderWheelRotation();
    renderWinnerLog();
    openAdmin();
  });
}

function renderWheelRotation() {
  wheel.style.transform = `rotate(${state.currentRotation}deg)`;
}

function showCelebrateOverlay() {
  celebrateGif.src = "";
  celebrateGif.src = "./gif/celebrate.gif";
  celebrateOverlay.classList.remove("hidden");

  setTimeout(() => {
    hideCelebrateOverlay();
  }, 2500);
}

function hideCelebrateOverlay() {
  celebrateOverlay.classList.add("hidden");
}

function getCurrentPrizeRates() {
  return getCurrentPrizeCorrection().rates;
}

function getCurrentPrizeCorrection() {
  const ranks = state.customerRanks || [];
  const lastRank = ranks[ranks.length - 1];
  const previousRank = ranks[ranks.length - 2];

  if (state.testEqualRates) {
    return {
      key: "testEqual",
      label: "테스트 동일 확률",
      reason: "왼쪽 아래 5번 탭으로 활성화",
      ranks: [...ranks],
      rates: PRIZE_RATE_TABLE.testEqual
    };
  }

  if (previousRank === 5 && lastRank === 5) {
    return {
      key: "afterRank5Twice",
      label: "5등 2연속 직후",
      reason: "3번 연속 5등 방지",
      ranks: [...ranks],
      rates: PRIZE_RATE_TABLE.afterRank5Twice
    };
  }

  if (previousRank === 4 && lastRank === 4) {
    return {
      key: "afterRank4Twice",
      label: "4등 2연속 직후",
      reason: "3번 연속 4등 방지",
      ranks: [...ranks],
      rates: PRIZE_RATE_TABLE.afterRank4Twice
    };
  }

  if (lastRank === 5) {
    return {
      key: "afterRank5Once",
      label: "5등 1회 직후",
      reason: "5등 연속 확률 완화",
      ranks: [...ranks],
      rates: PRIZE_RATE_TABLE.afterRank5Once
    };
  }

  return {
    key: "default",
    label: "기본",
    reason: "보정 없음",
    ranks: [...ranks],
    rates: PRIZE_RATE_TABLE.default
  };
}

function logPrizeCorrection(correction, prize) {
  console.log("[Fair Roulette] 보정 상태", {
    applied: correction.key !== "default",
    correction: correction.label,
    reason: correction.reason,
    customerRanks: correction.ranks.length ? correction.ranks.map(formatRank) : ["없음"],
    rates: formatRatesForLog(correction.rates),
    selected: formatRank(prize.rank),
    selectedPrizeName: prize.name
  });
}

function formatRatesForLog(rates) {
  return Object.fromEntries(
    Object.entries(rates).map(([rank, rate]) => [`${rank}등`, `${rate}%`])
  );
}

function registerCenterTap() {
  centerTapCount += 1;

  clearTimeout(centerTapTimer);
  centerTapTimer = setTimeout(() => {
    centerTapCount = 0;
  }, 1200);

  if (centerTapCount >= 3) {
    centerTapCount = 0;
    resetCustomerState();
  }
}

function resetCustomerState() {
  state.currentRotation = 0;
  state.customerRanks = [];
  state.failCount = 0;
  state.testEqualRates = false;
  saveState();
  wheel.style.transition = "none";
  renderWheelRotation();
  console.log("[Fair Roulette] 손님별 보정 초기화", {
    currentRotation: state.currentRotation,
    customerRanks: state.customerRanks,
    failCount: state.failCount,
    testEqualRates: state.testEqualRates
  });
}

function isInsideCenterButton(x, y) {
  const rect = centerButton.getBoundingClientRect();

  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function bindTestHotspot() {
  document.addEventListener("click", (e) => {
    if (!isInsideTestHotspot(e.clientX, e.clientY)) return;

    testHotspotTapCount += 1;

    clearTimeout(testHotspotTimer);
    testHotspotTimer = setTimeout(() => {
      testHotspotTapCount = 0;
    }, 1500);

    if (testHotspotTapCount >= 5) {
      testHotspotTapCount = 0;
      enableTestEqualRates();
    }
  });
}

function isInsideTestHotspot(x, y) {
  return x <= 90 && y >= window.innerHeight - 90;
}

function enableTestEqualRates() {
  state.testEqualRates = true;
  state.customerRanks = [];
  state.failCount = 0;
  saveState();
  console.log("[Fair Roulette] 테스트 동일 확률 활성화", {
    rates: formatRatesForLog(PRIZE_RATE_TABLE.testEqual)
  });
}

function openAdmin() {
  pityEnabled.value = String(state.pity.enabled);

  prizeEditor.innerHTML = state.prizes
    .map(
      (p, index) => `
      <div class="prizeRow" data-index="${index}">
        <div class="rankBadge">${escapeHtml(p.rank)}등</div>
        <label>상품명
          <input data-field="name" value="${escapeAttr(p.name)}" />
        </label>
      </div>
    `
    )
    .join("");

  adminLog.innerHTML = state.logs.length
    ? state.logs
        .slice(0, 20)
        .map((log) => `${escapeHtml(formatLogTimeValue(log.time))} / ${escapeHtml(formatRank(log.rank))}`)
        .join("<br>")
    : "로그 없음";

  adminModal.classList.remove("hidden");
}

function saveAdminFromInputs() {
  state.pity.enabled = pityEnabled.value === "true";

  document.querySelectorAll(".prizeRow").forEach((row) => {
    const index = Number(row.dataset.index);
    const prize = state.prizes[index];

    const nameInput = row.querySelector('input[data-field="name"]');
    prize.name = nameInput.value;
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function formatLogTime(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}월 ${day}일 ${hours}시 ${minutes}분`;
}

function formatLogTimeValue(value) {
  const text = String(value).replace(" /", "");
  const compactMatch = text.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);

  if (compactMatch) {
    const [, month, day, hours, minutes] = compactMatch;
    return `${Number(month)}월 ${Number(day)}일 ${hours.padStart(2, "0")}시 ${minutes}분`;
  }

  return text;
}

function formatRank(rank) {
  return `${Number(rank)}등`;
}

function getSafeStopJitter(prize) {
  const edgePadding = 10;
  const angles = state.prizes
    .map((p) => normalizeAngle(Number(p.angle)))
    .sort((a, b) => a - b);
  const prizeAngle = normalizeAngle(Number(prize.angle));
  const index = angles.findIndex((angle) => angle === prizeAngle);

  if (index === -1 || angles.length < 2) return 0;

  const previousAngle = angles[(index - 1 + angles.length) % angles.length];
  const nextAngle = angles[(index + 1) % angles.length];
  const distanceToPrevious = normalizeAngle(prizeAngle - previousAngle);
  const distanceToNext = normalizeAngle(nextAngle - prizeAngle);
  const safeRange = Math.max(0, Math.min(distanceToPrevious, distanceToNext) / 2 - edgePadding);

  return randomFloat(-safeRange, safeRange);
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
