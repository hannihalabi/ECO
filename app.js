const CREDENTIALS = {
  email: "info@webie.se",
  password: "Hemsida123",
};

const SHEET_ID = "11tiQl8n1AqMAqNJ_5snNQ-7Owik0YCJ_YWQzN0n-eUA";
const SHEET_NAMES = {
  income: "Income",
  expenses: "Expense",
};

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");

const app = document.getElementById("app");
const incomeList = document.getElementById("income-list");
const expensesList = document.getElementById("expenses-list");
const incomeTotal = document.getElementById("income-total");
const expensesTotal = document.getElementById("expenses-total");
const summaryCards = document.getElementById("summary-cards");

const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const panels = Array.from(document.querySelectorAll(".panel"));
const monthLabels = Array.from(document.querySelectorAll("[data-month-label]"));
const monthButtons = Array.from(document.querySelectorAll("[data-month-shift]"));

const state = {
  data: {
    income: [],
    expenses: [],
    lastUpdated: null,
  },
  monthKey: null,
};

const currencyFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (email === CREDENTIALS.email && password === CREDENTIALS.password) {
    localStorage.setItem("webie_authed", "1");
    loginError.textContent = "";
    setAuthenticated(true);
    loadData();
    return;
  }

  loginError.textContent = "Wrong email or password.";
});

function setAuthenticated(isAuthed) {
  if (isAuthed) {
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
  } else {
    loginScreen.classList.remove("hidden");
    app.classList.add("hidden");
  }
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
});

monthButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const shift = Number(button.dataset.monthShift || 0);
    if (!Number.isFinite(shift) || state.monthKey === null) {
      return;
    }
    setMonthKey(state.monthKey + shift);
  });
});

function parseStatusCell(value) {
  if (value === null || value === undefined || value === "") {
    return { active: true, label: "Active" };
  }

  if (typeof value === "boolean") {
    return { active: value, label: value ? "Active" : "Non-active" };
  }

  if (typeof value === "number") {
    return { active: value !== 0, label: value !== 0 ? "Active" : "Non-active" };
  }

  const raw = String(value).trim();
  if (!raw) {
    return { active: true, label: "Active" };
  }

  const normalized = raw.toLowerCase();
  const falseValues = [
    "0",
    "no",
    "false",
    "inactive",
    "inaktiv",
    "non-active",
    "non active",
    "nonactive",
    "paused",
    "off",
    "nej",
  ];
  const trueValues = ["1", "yes", "true", "active", "aktiv", "on"];

  if (falseValues.includes(normalized) || normalized.includes("non")) {
    return { active: false, label: raw };
  }
  if (trueValues.includes(normalized)) {
    return { active: true, label: raw };
  }

  return { active: true, label: raw };
}

function parseAmount(value) {
  if (typeof value === "number") {
    return value;
  }
  if (!value) {
    return 0;
  }
  let cleaned = String(value).trim().replace(/\s+/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(",", ".");
  }
  cleaned = cleaned.replace(/[^0-9.-]+/g, "");
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseSheetDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number") {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? null : asDate;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function monthKeyFromDate(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function monthKeyToDate(monthKey) {
  const year = Math.floor(monthKey / 12);
  const month = monthKey % 12;
  return new Date(year, month, 1);
}

function formatMonthLabel(monthKey) {
  if (monthKey === null) {
    return "--";
  }
  const date = monthKeyToDate(monthKey);
  return date.toLocaleString("sv-SE", { month: "short", year: "numeric" });
}

function isItemInMonth(item, monthKey) {
  if (monthKey === null) {
    return false;
  }
  const startKey = item.startKey ?? -Infinity;
  const endKey = item.endKey ?? Infinity;
  return monthKey >= startKey && monthKey <= endKey;
}

function getMonthBounds(items) {
  let min = Infinity;
  let max = -Infinity;

  items.forEach((item) => {
    if (item.startKey !== null) {
      min = Math.min(min, item.startKey);
    }
    if (item.endKey !== null) {
      max = Math.max(max, item.endKey);
    } else if (item.startKey !== null) {
      max = Math.max(max, item.startKey);
    }
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return { min, max };
}

function pickInitialMonth(items) {
  const currentKey = monthKeyFromDate(new Date());
  if (items.some((item) => isItemInMonth(item, currentKey))) {
    return currentKey;
  }

  const bounds = getMonthBounds(items);
  if (!bounds) {
    return currentKey;
  }

  if (currentKey < bounds.min) {
    return bounds.min;
  }
  if (currentKey > bounds.max) {
    return bounds.max;
  }

  return currentKey;
}

function updateMonthLabels() {
  const label = formatMonthLabel(state.monthKey);
  monthLabels.forEach((element) => {
    element.textContent = label;
  });
}

function setMonthKey(monthKey) {
  state.monthKey = monthKey;
  updateMonthLabels();
  renderCurrentMonth();
}

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

function renderList(container, items, emptyMessage) {
  container.innerHTML = "";

  if (!items.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = emptyMessage;
    container.appendChild(emptyState);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "row-card";
    if (!item.active) {
      card.classList.add("inactive");
    }

    const main = document.createElement("div");
    main.className = "row-main";

    const dot = document.createElement("span");
    dot.className = item.active ? "status-dot active" : "status-dot";

    const textWrap = document.createElement("div");

    const name = document.createElement("div");
    name.className = "row-name";
    name.textContent = item.name;

    const sub = document.createElement("div");
    sub.className = "row-sub";
    sub.textContent = item.statusLabel || (item.active ? "Active" : "Inactive");

    textWrap.appendChild(name);
    textWrap.appendChild(sub);

    main.appendChild(dot);
    main.appendChild(textWrap);

    const amount = document.createElement("div");
    amount.className = "row-amount";
    amount.textContent = formatCurrency(item.amount);

    card.appendChild(main);
    card.appendChild(amount);

    container.appendChild(card);
  });
}

function renderSummary(data) {
  summaryCards.innerHTML = "";

  const incomeActive = data.income.filter((item) => item.active);
  const expensesActive = data.expenses.filter((item) => item.active);

  const totalIncome = incomeActive.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expensesActive.reduce((sum, item) => sum + item.amount, 0);
  const net = totalIncome - totalExpenses;

  const cards = [
    {
      title: "Active income",
      value: formatCurrency(totalIncome),
    },
    {
      title: "Active expenses",
      value: formatCurrency(totalExpenses),
    },
    {
      title: "Net MRR",
      value: formatCurrency(net),
      tone: net >= 0 ? "positive" : "negative",
    },
    {
      title: "Subscriptions",
      value: `${incomeActive.length} / ${data.income.length} active`,
    },
  ];

  if (data.lastUpdated) {
    cards.push({
      title: "Last sync",
      value: data.lastUpdated,
    });
  }

  cards.forEach((cardData) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    if (cardData.tone) {
      card.classList.add(cardData.tone);
    }

    const title = document.createElement("h3");
    title.textContent = cardData.title;

    const value = document.createElement("strong");
    value.textContent = cardData.value;

    card.appendChild(title);
    card.appendChild(value);

    summaryCards.appendChild(card);
  });
}

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(
    sheetName
  )}`;
  const response = await fetch(url);
  const text = await response.text();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = JSON.parse(text.slice(start, end + 1));
  return json.table.rows.map((row) => row.c.map((cell) => (cell ? cell.v ?? cell.f : "")));
}

function normalizeRows(rows) {
  return rows
    .map((row) => {
      const name = row[0] ? String(row[0]).trim() : "";
      const status = parseStatusCell(row[1]);
      const amount = parseAmount(row[2]);
      const startDate = parseSheetDate(row[3]);
      const endDate = parseSheetDate(row[4]);
      const startKey = startDate ? monthKeyFromDate(startDate) : null;
      const endKey = endDate ? monthKeyFromDate(endDate) : null;

      return {
        name,
        amount,
        active: status.active,
        statusLabel: status.label,
        startDate,
        endDate,
        startKey,
        endKey,
      };
    })
    .filter((row) => row.name);
}

function renderLoading() {
  const loadingState = document.createElement("div");
  loadingState.className = "empty-state";
  loadingState.textContent = "Loading data from Google Sheets...";

  incomeList.innerHTML = "";
  expensesList.innerHTML = "";
  summaryCards.innerHTML = "";

  incomeList.appendChild(loadingState.cloneNode(true));
  expensesList.appendChild(loadingState.cloneNode(true));
  summaryCards.appendChild(loadingState);

  monthLabels.forEach((label) => {
    label.textContent = "Loading";
  });
}

function renderCurrentMonth() {
  if (state.monthKey === null) {
    return;
  }

  const monthLabel = formatMonthLabel(state.monthKey);
  const incomeInMonth = state.data.income.filter((item) => isItemInMonth(item, state.monthKey));
  const expensesInMonth = state.data.expenses.filter((item) => isItemInMonth(item, state.monthKey));

  const activeIncomeTotal = incomeInMonth
    .filter((item) => item.active)
    .reduce((sum, item) => sum + item.amount, 0);
  const activeExpensesTotal = expensesInMonth
    .filter((item) => item.active)
    .reduce((sum, item) => sum + item.amount, 0);

  incomeTotal.textContent = formatCurrency(activeIncomeTotal);
  expensesTotal.textContent = formatCurrency(activeExpensesTotal);

  renderList(incomeList, incomeInMonth, `No income for ${monthLabel}.`);
  renderList(expensesList, expensesInMonth, `No expenses for ${monthLabel}.`);

  renderSummary({
    income: incomeInMonth,
    expenses: expensesInMonth,
    lastUpdated: state.data.lastUpdated,
  });
}

async function loadData() {
  if (!SHEET_ID || SHEET_ID === "PASTE_SHEET_ID_HERE") {
    renderList(incomeList, [], "Add your Google Sheet ID in app.js to load income.");
    renderList(expensesList, [], "Add your Google Sheet ID in app.js to load expenses.");
    renderSummary({ income: [], expenses: [], lastUpdated: null });
    incomeTotal.textContent = "--";
    expensesTotal.textContent = "--";
    monthLabels.forEach((label) => {
      label.textContent = "--";
    });
    return;
  }

  renderLoading();

  try {
    const [incomeRows, expenseRows] = await Promise.all([
      fetchSheet(SHEET_NAMES.income),
      fetchSheet(SHEET_NAMES.expenses),
    ]);

    const income = normalizeRows(incomeRows);
    const expenses = normalizeRows(expenseRows);

    const lastUpdated = new Date().toLocaleString("sv-SE", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    state.data = { income, expenses, lastUpdated };

    const allItems = [...income, ...expenses];
    const initialMonth = pickInitialMonth(allItems);
    setMonthKey(initialMonth);
  } catch (error) {
    renderList(incomeList, [], "Could not load income sheet.");
    renderList(expensesList, [], "Could not load expenses sheet.");
    renderSummary({ income: [], expenses: [], lastUpdated: null });
    incomeTotal.textContent = "--";
    expensesTotal.textContent = "--";
    monthLabels.forEach((label) => {
      label.textContent = "--";
    });
  }
}

function init() {
  const isAuthed = localStorage.getItem("webie_authed") === "1";
  setAuthenticated(isAuthed);
  if (isAuthed) {
    loadData();
  }
  setActiveTab("income");
}

init();
