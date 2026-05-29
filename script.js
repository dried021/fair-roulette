const STORAGE_KEY = "fair-roulette-state-v1";

const defaultState = {
  prizes: [
    { id: 1, name: "1등 상품", rank: 1, weight: 1, stock: 1, angle: 0 },
    { id: 2, name: "2등 상품", rank: 2, weight: 4, stock: 3, angle: 60 },
    { id: 3, name: "3등 상품", rank: 3, weight: 15, stock: 10, angle: 120 },
    { id: 4, name: "참가상", rank: 4, weight: 40, stock: 999, angle: 180 },
    { id: 5, name: "꽝", rank: 99, weight: 40, stock: 9999, angle: 240 }
  ],
  pity: {
    enabled: true,
    maxFailCount: 15,
    guaranteedRank: 3
  },
  failCount: 0,
  currentRotation: 0,
  logs: []
};

let state = loadState();
let isSpinning = false;

const wheel = document.getElementById("wheel");
const rouletteArea = document.getElementById("rouletteArea");
const resultModal = document.getElementById("resultModal");
const resultPrize = document.getElementById("resultPrize");
const closeResultBtn = document.getElementById("closeResultBtn");

const adminHotspot = document.getElementById("adminHotspot");
const adminModal = document.getElementById("adminModal");
const closeAdminBtn = document.getElementById("closeAdminBtn");
const saveAdminBtn = document.getElementById("saveAdminBtn");
const resetLogsBtn = document.getElementById("resetLogsBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

const pityEnabled = document.getElementById("pityEnabled");
const pityMaxFailCount = document.getElementById("pityMaxFailCount");
const pityGuaranteedRank = document.getElementById("pityGuaranteedRank");
const prizeEditor = document.getElementById("prizeEditor");
const winnerLogList = document.getElementById("winnerLogList");
const adminLog = document.getElementById("adminLog");

let pointerDown = false;
let startX = 0;
let startY = 0;
let startTime = 0;
let hotspotTapCount = 0;
let hotspotTimer = null;

init();

function init() {
  wheel.style.transform = `rotate(${state.currentRotation}deg)`;
  renderWinnerLog();
  bindGesture();
  bindAdmin();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
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

  const prize = pickPrize();
  if (!prize) {
    alert("당첨 가능한 상품이 없습니다. 관리자 설정을 확인하세요.");
    return;
  }

  isSpinning = true;

  const fullSpins = randomInt(6, 9) * 360;
  const targetAngle = 360 - prize.angle;
  const jitter = randomInt(-10, 10);

  const nextRotation = state.currentRotation + fullSpins + targetAngle + jitter;

  wheel.style.transition = "transform 4.2s cubic-bezier(0.12, 0.72, 0.08, 1)";
  wheel.style.transform = `rotate(${nextRotation}deg)`;

  setTimeout(() => {
    state.currentRotation = nextRotation % 360;

    applyPrizeResult(prize);
    saveState();
    renderWinnerLog();

    resultPrize.textContent = prize.name;
    resultModal.classList.remove("hidden");

    wheel.style.transition = "none";
    wheel.style.transform = `rotate(${state.currentRotation}deg)`;

    isSpinning = false;
  }, 4300);
}

function pickPrize() {
  const available = state.prizes.filter((p) => Number(p.stock) > 0 && Number(p.weight) > 0);

  if (available.length === 0) return null;

  const pityHit =
    state.pity.enabled &&
    state.failCount + 1 >= Number(state.pity.maxFailCount);

  if (pityHit) {
    const guaranteed = available
      .filter((p) => Number(p.rank) <= Number(state.pity.guaranteedRank))
      .sort((a, b) => a.rank - b.rank);

    if (guaranteed.length > 0) {
      return weightedPick(guaranteed);
    }
  }

  return weightedPick(available);
}

function weightedPick(list) {
  const total = list.reduce((sum, p) => sum + Number(p.weight), 0);
  let r = Math.random() * total;

  for (const p of list) {
    r -= Number(p.weight);
    if (r <= 0) return p;
  }

  return list[list.length - 1];
}

function applyPrizeResult(prize) {
  const target = state.prizes.find((p) => p.id === prize.id);
  if (target && Number(target.stock) > 0) {
    target.stock = Number(target.stock) - 1;
  }

  if (Number(prize.rank) <= Number(state.pity.guaranteedRank)) {
    state.failCount = 0;
  } else {
    state.failCount += 1;
  }

  state.logs.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    prizeId: prize.id,
    prizeName: prize.name,
    rank: prize.rank,
    time: new Date().toLocaleString("ko-KR")
  });

  state.logs = state.logs.slice(0, 100);
}

function renderWinnerLog() {
  const winners = state.logs
    .filter((log) => Number(log.rank) <= 3)
    .slice(0, 5);

  winnerLogList.innerHTML = winners.length
    ? winners.map((log) => `<li>${log.time} - ${escapeHtml(log.prizeName)}</li>`).join("")
    : `<li>아직 없음</li>`;
}

closeResultBtn.addEventListener("click", () => {
  resultModal.classList.add("hidden");
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
    saveState();
    renderWinnerLog();
    openAdmin();
  });

  resetAllBtn.addEventListener("click", () => {
    if (!confirm("전체 데이터를 초기화할까요?")) return;
    state = structuredClone(defaultState);
    saveState();
    renderWinnerLog();
    openAdmin();
  });
}

function openAdmin() {
  pityEnabled.value = String(state.pity.enabled);
  pityMaxFailCount.value = state.pity.maxFailCount;
  pityGuaranteedRank.value = state.pity.guaranteedRank;

  prizeEditor.innerHTML = state.prizes
    .map(
      (p, index) => `
      <div class="prizeRow" data-index="${index}">
        <label>상품명
          <input data-field="name" value="${escapeAttr(p.name)}" />
        </label>
        <label>등수
          <input data-field="rank" type="number" value="${p.rank}" />
        </label>
        <label>확률 가중치
          <input data-field="weight" type="number" value="${p.weight}" />
        </label>
        <label>재고
          <input data-field="stock" type="number" value="${p.stock}" />
        </label>
        <label>룰렛 각도
          <input data-field="angle" type="number" value="${p.angle}" />
        </label>
      </div>
    `
    )
    .join("");

  adminLog.innerHTML = state.logs.length
    ? state.logs
        .slice(0, 20)
        .map((log) => `${log.time} - ${escapeHtml(log.prizeName)} / ${log.rank}등`)
        .join("<br>")
    : "로그 없음";

  adminModal.classList.remove("hidden");
}

function saveAdminFromInputs() {
  state.pity.enabled = pityEnabled.value === "true";
  state.pity.maxFailCount = Number(pityMaxFailCount.value);
  state.pity.guaranteedRank = Number(pityGuaranteedRank.value);

  document.querySelectorAll(".prizeRow").forEach((row) => {
    const index = Number(row.dataset.index);
    const prize = state.prizes[index];

    row.querySelectorAll("input").forEach((input) => {
      const field = input.dataset.field;
      if (field === "name") {
        prize[field] = input.value;
      } else {
        prize[field] = Number(input.value);
      }
    });
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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