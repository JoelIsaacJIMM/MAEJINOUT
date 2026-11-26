const PAGE_LABELS = {
  dashboard: "Panel principal",
  income: "Ingresos",
  expenses: "Gastos",
  equipment: "Equipos",
  summary: "Resumen mensual",
};
const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const shortDate = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const monthFormat = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
});

function emptyData() {
  return { incomes: [], expenses: [], equipment: [], fundHistory: [] };
}

let data = emptyData();
let activePage = "dashboard";
let toastTimer;
let authToken = sessionStorage.getItem("maej_auth_token");
let currentUser = null;

const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");

async function authRequest(path, options = {}) {
  const response = await fetch(`/api/auth${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}

function showApp(user) {
  currentUser = user;
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  if (user?.nombre) {
    document.querySelector(".user-copy strong").textContent = user.nombre;
    document.querySelector(".avatar").textContent = user.nombre.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }
  refreshData().catch((error) => {
    console.error("No se pudieron cargar los datos de la API.", error);
    showToast("No se pudo conectar con la API. Inicia el servidor con npm start.");
  });
}

async function restoreSession() {
  if (!authToken) return;
  try {
    const result = await fetch("/api/auth/session", { headers: { Authorization: `Bearer ${authToken}` } });
    if (!result.ok) throw new Error("Sesión vencida");
    showApp((await result.json()).user);
  } catch {
    sessionStorage.removeItem("maej_auth_token");
    authToken = null;
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `La API respondió con el estado ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

async function refreshData() {
  const [incomes, expenses, equipment, fundHistory] = await Promise.all([
    apiRequest("/transactions?type=income"),
    apiRequest("/transactions?type=expense"),
    apiRequest("/equipment"),
    apiRequest("/investment-fund"),
  ]);
  data = { incomes, expenses, equipment, fundHistory };
  renderAll();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatCurrency(value) {
  return currency.format(Number(value) || 0);
}

function dateKey(value) {
  return String(value || "").slice(0, 10);
}

function localDateISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthOf(value) {
  return dateKey(value).slice(0, 7);
}

function monthAmount(entries, month) {
  return entries
    .filter((entry) => monthOf(entry.date) === month)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

function latestFundForMonth(month) {
  return data.fundHistory
    .filter((entry) => entry.month <= month)
    .sort((a, b) => a.month.localeCompare(b.month))
    .at(-1)?.amount ?? 0;
}

function amountClass(kind) {
  return kind === "income" ? "amount-positive" : "amount-negative";
}

function renderDashboard() {
  const month = currentMonthKey();
  const income = monthAmount(data.incomes, month);
  const expenses = monthAmount(data.expenses, month);
  document.querySelector("#dashboard-income").textContent = formatCurrency(income);
  document.querySelector("#dashboard-expenses").textContent = formatCurrency(expenses);
  document.querySelector("#dashboard-profit").textContent = formatCurrency(income - expenses);
  document.querySelector("#dashboard-fund").textContent = formatCurrency(latestFundForMonth(month));

  const movements = [
    ...data.incomes.map((item) => ({ ...item, kind: "income" })),
    ...data.expenses.map((item) => ({ ...item, kind: "expense" })),
  ].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)) || b.id.localeCompare(a.id)).slice(0, 6);
  const body = document.querySelector("#recent-movements");
  body.innerHTML = movements.map((item) => `
    <tr>
      <td><span class="movement-name"><span class="movement-bullet ${item.kind}">${item.kind === "income" ? "↙" : "↗"}</span>${escapeHTML(item.concept)}</span></td>
      <td>${escapeHTML(shortDate.format(new Date(`${dateKey(item.date)}T12:00:00`)))}</td>
      <td>${item.kind === "income" ? "Ingreso" : "Gasto"}</td>
      <td class="align-right ${amountClass(item.kind)}">${item.kind === "income" ? "+" : "−"}${escapeHTML(formatCurrency(item.amount))}</td>
    </tr>`).join("");
  document.querySelector("#recent-empty").classList.toggle("hidden", movements.length > 0);
}

function renderIncome() {
  const query = document.querySelector('[data-search="income"]').value.trim().toLocaleLowerCase("es-MX");
  const filtered = [...data.incomes]
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    .filter((item) => `${item.concept} ${item.method} ${item.notes}`.toLocaleLowerCase("es-MX").includes(query));
  document.querySelector("#income-count").textContent = `${data.incomes.length} ${data.incomes.length === 1 ? "ingreso registrado" : "ingresos registrados"}`;
  document.querySelector("#income-list").innerHTML = filtered.map((item) => `
    <tr>
      <td><span class="movement-name"><span class="movement-bullet income">↙</span>${escapeHTML(item.concept)}</span></td>
      <td>${escapeHTML(shortDate.format(new Date(`${dateKey(item.date)}T12:00:00`)))}</td>
      <td>${escapeHTML(item.method)}</td>
      <td class="note-cell" title="${escapeHTML(item.notes)}">${escapeHTML(item.notes || "—")}</td>
      <td class="align-right amount-positive">${escapeHTML(formatCurrency(item.amount))}</td>
      <td><button class="delete-button" type="button" data-delete="income" data-id="${escapeHTML(item.id)}" aria-label="Eliminar ingreso ${escapeHTML(item.concept)}" title="Eliminar">×</button></td>
    </tr>`).join("");
  document.querySelector("#income-empty").classList.toggle("hidden", filtered.length > 0);
}

function renderExpenses() {
  const query = document.querySelector('[data-search="expense"]').value.trim().toLocaleLowerCase("es-MX");
  const filtered = [...data.expenses]
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    .filter((item) => `${item.concept} ${item.category} ${item.method} ${item.notes}`.toLocaleLowerCase("es-MX").includes(query));
  document.querySelector("#expense-count").textContent = `${data.expenses.length} ${data.expenses.length === 1 ? "gasto registrado" : "gastos registrados"}`;
  document.querySelector("#expense-list").innerHTML = filtered.map((item) => `
    <tr>
      <td><span class="movement-name"><span class="movement-bullet expense">↗</span>${escapeHTML(item.concept)}</span></td>
      <td>${escapeHTML(shortDate.format(new Date(`${dateKey(item.date)}T12:00:00`)))}</td>
      <td><span class="category-chip">${escapeHTML(item.category)}</span></td>
      <td>${escapeHTML(item.method)}</td>
      <td class="note-cell" title="${escapeHTML(item.notes)}">${escapeHTML(item.notes || "—")}</td>
      <td class="align-right amount-negative">${escapeHTML(formatCurrency(item.amount))}</td>
      <td><button class="delete-button" type="button" data-delete="expense" data-id="${escapeHTML(item.id)}" aria-label="Eliminar gasto ${escapeHTML(item.concept)}" title="Eliminar">×</button></td>
    </tr>`).join("");
  document.querySelector("#expense-empty").classList.toggle("hidden", filtered.length > 0);
}

function statusClass(status) {
  return `status-${String(status).toLocaleLowerCase("es-MX").replaceAll(" ", "-")}`;
}

function renderEquipment() {
  const query = document.querySelector('[data-search="equipment"]').value.trim().toLocaleLowerCase("es-MX");
  const status = document.querySelector("#equipment-status-filter").value;
  const filtered = [...data.equipment]
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    .filter((item) => `${item.name} ${item.type} ${item.supplier}`.toLocaleLowerCase("es-MX").includes(query))
    .filter((item) => !status || item.status === status);
  document.querySelector("#equipment-count").textContent = `${data.equipment.length} ${data.equipment.length === 1 ? "equipo registrado" : "equipos registrados"}`;
  document.querySelector("#equipment-list").innerHTML = filtered.map((item) => `
    <tr>
      <td><span class="movement-name"><span class="quick-icon quick-blue">▦</span>${escapeHTML(item.name)}</span></td>
      <td><span class="type-chip">${escapeHTML(item.type)}</span></td>
      <td>${escapeHTML(shortDate.format(new Date(`${dateKey(item.date)}T12:00:00`)))}</td>
      <td>${escapeHTML(item.supplier || "—")}</td>
      <td>${escapeHTML(item.method || "—")}</td>
      <td><span class="status-chip ${statusClass(item.status)}">${escapeHTML(item.status)}</span></td>
      <td class="align-right">${escapeHTML(formatCurrency(item.amount))}</td>
      <td><button class="delete-button" type="button" data-delete="equipment" data-id="${escapeHTML(item.id)}" aria-label="Eliminar equipo ${escapeHTML(item.name)}" title="Eliminar">×</button></td>
    </tr>`).join("");
  document.querySelector("#equipment-empty").classList.toggle("hidden", filtered.length > 0);
}

function renderSummary() {
  const months = new Set([
    ...data.incomes.map((item) => monthOf(item.date)),
    ...data.expenses.map((item) => monthOf(item.date)),
    ...data.fundHistory.map((item) => item.month),
  ]);
  const sortedMonths = [...months].filter(Boolean).sort((a, b) => b.localeCompare(a));
  const rows = sortedMonths.map((month) => {
    const income = monthAmount(data.incomes, month);
    const expenses = monthAmount(data.expenses, month);
    const label = monthFormat.format(new Date(`${month}-15T12:00:00`));
    return `<tr><td>${escapeHTML(label)}</td><td class="align-right amount-positive">${escapeHTML(formatCurrency(income))}</td><td class="align-right amount-negative">${escapeHTML(formatCurrency(expenses))}</td><td class="align-right">${escapeHTML(formatCurrency(latestFundForMonth(month)))}</td><td class="align-right">${escapeHTML(formatCurrency(income - expenses))}</td></tr>`;
  });
  document.querySelector("#monthly-summary").innerHTML = rows.join("");
  document.querySelector("#summary-empty").classList.toggle("hidden", sortedMonths.length > 0);
  const currentIncome = monthAmount(data.incomes, currentMonthKey());
  const currentExpenses = monthAmount(data.expenses, currentMonthKey());
  document.querySelector("#summary-current-profit").textContent = formatCurrency(currentIncome - currentExpenses);
  document.querySelector("#summary-current-caption").textContent = `${formatCurrency(currentIncome)} en ingresos · ${formatCurrency(currentExpenses)} en gastos`;
}

function renderAll() {
  renderDashboard();
  renderIncome();
  renderExpenses();
  renderEquipment();
  renderSummary();
}

function navigateTo(page) {
  if (!PAGE_LABELS[page]) return;
  activePage = page;
  document.querySelectorAll(".page-section").forEach((section) => section.classList.remove("active"));
  document.querySelector(`#page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.nav === page));
  document.querySelector("#breadcrumb-current").textContent = PAGE_LABELS[page];
  document.querySelector("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm(form) {
  form.reset();
  const dateInput = form.querySelector('input[type="date"]');
  if (dateInput) dateInput.value = localDateISO();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("es-MX", {
  weekday: "short", day: "numeric", month: "short", year: "numeric",
}).format(new Date());

document.addEventListener("click", async (event) => {
  const navigation = event.target.closest("[data-nav]");
  if (navigation) navigateTo(navigation.dataset.nav);

  const toggleButton = event.target.closest("[data-form-toggle]");
  if (toggleButton) {
    const formId = toggleButton.dataset.formToggle;
    const cardId = `${formId}-card`;
    const card = document.getElementById(cardId);
    card.classList.toggle("hidden");
    if (!card.classList.contains("hidden")) {
      const form = document.getElementById(formId);
      if (!form.querySelector('input[type="date"]').value) resetForm(form);
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      form.querySelector("input, select")?.focus({ preventScroll: true });
    }
  }

  if (event.target.closest(".form-close, .form-cancel")) {
    const card = event.target.closest(".form-card");
    card.classList.add("hidden");
    resetForm(card.querySelector("form"));
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    const type = deleteButton.dataset.delete;
    const labels = { income: "ingreso", expense: "gasto", equipment: "equipo" };
    if (!window.confirm(`¿Eliminar este ${labels[type]}? Esta acción no se puede deshacer.`)) return;
    const key = type === "income" ? "incomes" : type === "expense" ? "expenses" : "equipment";
    try {
      await apiRequest(`/${type === "income" || type === "expense" ? "transactions" : "equipment"}/${encodeURIComponent(deleteButton.dataset.id)}`, { method: "DELETE" });
      await refreshData();
      showToast(`${labels[type][0].toUpperCase()}${labels[type].slice(1)} eliminado.`);
    } catch (error) {
      console.error("No se pudo eliminar el registro.", error);
      showToast(error.message);
    }
  }
});

document.querySelectorAll(".entry-form").forEach((form) => {
  const dateInput = form.querySelector('input[type="date"]');
  if (dateInput) dateInput.value = localDateISO();
});

document.querySelector("#income-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  let savedIncome;

  try {
    savedIncome = await apiRequest("/transactions", {
      method: "POST",
      body: JSON.stringify({ ...values, type: "income", amount: Number(values.amount) }),
    });
  } catch (error) {
    console.error("No se pudo guardar el ingreso.", error);
    showToast(error.message);
    return;
  }

  data.incomes = [savedIncome, ...data.incomes.filter((income) => income.id !== savedIncome.id)];
  renderAll();
  form.closest(".form-card").classList.add("hidden");
  resetForm(form);

  try {
    await refreshData();
    showToast("Ingreso guardado correctamente.");
  } catch (error) {
    console.error("El ingreso se guardó, pero no se pudieron actualizar todos los datos.", error);
    showToast("Ingreso guardado. No se pudieron actualizar los demás datos.");
  }
});

document.querySelector("#expense-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  try {
    await apiRequest("/transactions", {
      method: "POST",
      body: JSON.stringify({ ...values, type: "expense", amount: Number(values.amount) }),
    });
    await refreshData();
    form.closest(".form-card").classList.add("hidden");
    resetForm(form);
    showToast("Gasto guardado correctamente.");
  } catch (error) {
    console.error("No se pudo guardar el gasto.", error);
    showToast(error.message);
  }
});

document.querySelector("#equipment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  try {
    await apiRequest("/equipment", {
      method: "POST",
      body: JSON.stringify({ ...values, amount: Number(values.amount) }),
    });
    await refreshData();
    form.closest(".form-card").classList.add("hidden");
    resetForm(form);
    showToast("Equipo guardado correctamente.");
  } catch (error) {
    console.error("No se pudo guardar el equipo.", error);
    showToast(error.message);
  }
});

document.querySelector("#fund-toggle").addEventListener("click", () => {
  const form = document.querySelector("#fund-form");
  const input = document.querySelector("#fund-amount");
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) {
    input.value = latestFundForMonth(currentMonthKey());
    input.focus();
  }
});

document.querySelector("#fund-cancel").addEventListener("click", () => {
  document.querySelector("#fund-form").classList.add("hidden");
});

document.querySelector("#fund-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const amount = Number(document.querySelector("#fund-amount").value);
  if (!Number.isFinite(amount) || amount < 0) {
    showToast("Escribe un saldo válido para el fondo.");
    return;
  }
  try {
    await apiRequest("/investment-fund", {
      method: "PUT",
      body: JSON.stringify({ amount, month: currentMonthKey() }),
    });
    await refreshData();
    form.classList.add("hidden");
    showToast("Saldo del fondo actualizado.");
  } catch (error) {
    console.error("No se pudo actualizar el fondo.", error);
    showToast(error.message);
  }
});

document.querySelectorAll("[data-search]").forEach((input) => {
  input.addEventListener("input", () => {
    if (input.dataset.search === "income") renderIncome();
    if (input.dataset.search === "expense") renderExpenses();
    if (input.dataset.search === "equipment") renderEquipment();
  });
});
document.querySelector("#equipment-status-filter").addEventListener("change", renderEquipment);
document.querySelector("#menu-toggle").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector("#sidebar").classList.remove("open");
});

const loginForm = document.querySelector("#login-form");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formValues(loginForm);
  try {
    const result = await authRequest("/login", { method: "POST", body: JSON.stringify(values) });
    authToken = result.token;
    sessionStorage.setItem("maej_auth_token", authToken);
    loginForm.reset();
    showApp(result.user);
  } catch (error) {
    const message = document.querySelector("#login-message");
    message.textContent = error.message;
    message.classList.remove("hidden", "success");
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await authRequest("/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    // Limpiar la sesión local aunque el servidor no responda.
  }
  sessionStorage.removeItem("maej_auth_token");
  authToken = null;
  currentUser = null;
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginForm.reset();
});

restoreSession();
