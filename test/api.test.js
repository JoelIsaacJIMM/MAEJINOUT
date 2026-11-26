const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const { after, before, test } = require("node:test");
const { createApp } = require("../server");
const Ingreso = require("../models/Ingresos");

let server;
let baseUrl;

function createMemoryStore() {
  const transactions = [];
  const equipment = [];
  const funds = [];

  function updateRecord(records, id, fields) {
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return null;
    records[index] = { ...records[index], ...fields };
    return { ...records[index] };
  }

  function deleteRecord(records, id) {
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return false;
    records.splice(index, 1);
    return true;
  }

  return {
    async listTransactions({ type, month }) {
      return transactions
        .filter((record) => (!type || record.type === type) && (!month || record.date.startsWith(month)))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((record) => ({ ...record }));
    },
    async createTransaction(fields) {
      const record = { id: randomUUID(), ...fields };
      transactions.push(record);
      return { ...record };
    },
    async getTransaction(id) {
      const record = transactions.find((item) => item.id === id);
      return record ? { ...record } : null;
    },
    async updateTransaction(id, fields) {
      return updateRecord(transactions, id, fields);
    },
    async deleteTransaction(id) {
      return deleteRecord(transactions, id);
    },
    async listEquipment() {
      return equipment.map((record) => ({ ...record }));
    },
    async createEquipment(fields) {
      const record = { id: randomUUID(), ...fields };
      equipment.push(record);
      return { ...record };
    },
    async getEquipment(id) {
      const record = equipment.find((item) => item.id === id);
      return record ? { ...record } : null;
    },
    async updateEquipment(id, fields) {
      return updateRecord(equipment, id, fields);
    },
    async deleteEquipment(id) {
      return deleteRecord(equipment, id);
    },
    async listInvestmentFund(month) {
      return funds
        .filter((record) => !month || record.month === month)
        .sort((a, b) => a.month.localeCompare(b.month))
        .map(({ month: recordMonth, amount }) => ({ month: recordMonth, amount }));
    },
    async setInvestmentFund(month, amount) {
      const current = funds.find((record) => record.month === month);
      if (current) current.amount = amount;
      else funds.push({ month, amount });
      return { month, amount };
    },
    async dashboard(month) {
      const monthTransactions = transactions.filter((record) => record.date.startsWith(month));
      const income = monthTransactions.reduce((sum, record) => sum + (record.type === "income" ? record.amount : 0), 0);
      const expenses = monthTransactions.reduce((sum, record) => sum + (record.type === "expense" ? record.amount : 0), 0);
      const fund = funds.filter((record) => record.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
      return { month, income, expenses, profit: income - expenses, investmentFund: fund?.amount ?? 0 };
    },
    async monthlySummary(year) {
      const yearTransactions = transactions.filter((record) => record.date.startsWith(`${year}-`));
      const yearFunds = funds.filter((record) => record.month.startsWith(`${year}-`));
      const months = new Set([
        ...yearTransactions.map((record) => record.date.slice(0, 7)),
        ...yearFunds.map((record) => record.month),
      ]);
      return [...months].sort((a, b) => b.localeCompare(a)).map((month) => {
        const monthTransactions = yearTransactions.filter((record) => record.date.startsWith(month));
        const income = monthTransactions.reduce((sum, record) => sum + (record.type === "income" ? record.amount : 0), 0);
        const expenses = monthTransactions.reduce((sum, record) => sum + (record.type === "expense" ? record.amount : 0), 0);
        const fund = funds.filter((record) => record.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
        return { month, income, expenses, investmentFund: fund?.amount ?? 0, profit: income - expenses };
      });
    },
  };
}

before(async () => {
  server = createApp(createMemoryStore(), () => true).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("income model retains the company identifier used by MongoDB queries", () => {
  const income = new Ingreso({
    date: "2026-10-10",
    concept: "Venta de prueba",
    amount: 1250,
    method: "Transferencia",
  });

  assert.equal(income.companyId, "default");
});

test("health reports MongoDB readiness", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "connected" });
});

test("health returns unavailable when MongoDB is disconnected", async () => {
  const disconnectedServer = createApp(undefined, () => false).listen(0, "127.0.0.1");
  await once(disconnectedServer, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${disconnectedServer.address().port}/api/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "error", database: "disconnected" });
  } finally {
    await new Promise((resolve) => disconnectedServer.close(resolve));
  }
});

test("public registration is disabled and user listing is not exposed", async () => {
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: "Cuenta no autorizada", email: "no@example.com", password: "password" }),
  });
  assert.equal(registration.status, 403);
  assert.match((await registration.json()).error, /registro público está deshabilitado/i);

  const users = await fetch(`${baseUrl}/api/usuarios`);
  assert.equal(users.status, 404);
});

test("transactions, equipment, investment fund and reports work end to end", async () => {
  const incomeResponse = await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "income",
      date: "2026-10-10",
      concept: "Venta de prueba",
      amount: 1250,
      method: "Transferencia",
    }),
  });
  assert.equal(incomeResponse.status, 201);
  const income = await incomeResponse.json();
  assert.equal(income.type, "income");

  const expenseResponse = await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "expense",
      date: "2026-10-11",
      concept: "Servicio de prueba",
      category: "Servicios",
      amount: 250,
      method: "Tarjeta",
    }),
  });
  assert.equal(expenseResponse.status, 201);
  const expense = await expenseResponse.json();

  const updateResponse = await fetch(`${baseUrl}/api/transactions/${income.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept: "Venta actualizada" }),
  });
  assert.equal((await updateResponse.json()).concept, "Venta actualizada");

  const equipmentResponse = await fetch(`${baseUrl}/api/equipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Laptop de prueba",
      type: "Cómputo",
      date: "2026-10-12",
      amount: 18000,
      status: "Planeado",
    }),
  });
  assert.equal(equipmentResponse.status, 201);
  const savedEquipment = await equipmentResponse.json();

  const fundResponse = await fetch(`${baseUrl}/api/investment-fund`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month: "2026-10", amount: 32000 }),
  });
  assert.equal((await fundResponse.json()).amount, 32000);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard?month=2026-10`);
  assert.deepEqual(await dashboardResponse.json(), {
    month: "2026-10",
    income: 1250,
    expenses: 250,
    profit: 1000,
    investmentFund: 32000,
  });

  const summaryResponse = await fetch(`${baseUrl}/api/monthly-summary?year=2026`);
  const summary = await summaryResponse.json();
  assert.equal(summary.length, 1);
  assert.equal(summary[0].profit, 1000);

  for (const [resource, id] of [
    ["transactions", income.id],
    ["transactions", expense.id],
    ["equipment", savedEquipment.id],
  ]) {
    const deleteResponse = await fetch(`${baseUrl}/api/${resource}/${id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);
  }
});

test("invalid transaction payloads return a useful client error", async () => {
  const response = await fetch(`${baseUrl}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "income", date: "not-a-date", amount: -1 }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /tipo|fecha/i);
});

test("frontend is served without a SQLite database file", async () => {
  const frontend = await fetch(baseUrl);
  assert.equal(frontend.status, 200);
  const appScript = await fetch(`${baseUrl}/app.js`);
  assert.equal(appScript.status, 200);
  const script = await appScript.text();
  assert.match(script, /authRequest\("\/login"/);
  assert.match(script, /sessionStorage\.setItem\("maej_auth_token"/);
  const databaseFile = await fetch(`${baseUrl}/data/maej-inout.sqlite`);
  assert.equal(databaseFile.status, 404);
});
