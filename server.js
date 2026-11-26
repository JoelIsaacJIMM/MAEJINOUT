require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const conectarDB = require("./database/db");
const mongoStore = require("./database/mongoStore");
const path = require("node:path");

const port = Number(process.env.PORT) || 3000;

function isValidDate(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isValidMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function validateText(value, field, { required = false, max = 240 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw Object.assign(new Error(`El campo '${field}' es obligatorio.`), { status: 400 });
    return "";
  }
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw Object.assign(new Error(`El campo '${field}' debe ser texto${required ? " no vacío" : ""} de máximo ${max} caracteres.`), { status: 400 });
  }
  return value.trim();
}

function validateAmount(value, { allowZero = false } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw Object.assign(new Error(`La cantidad debe ser un número ${allowZero ? "mayor o igual a cero" : "mayor que cero"}.`), { status: 400 });
  }
  return amount;
}

function validateTransaction(body, existing = {}) {
  const type = body.type ?? existing.type;
  if (!["income", "expense"].includes(type)) {
    throw Object.assign(new Error("El tipo debe ser 'income' o 'expense'."), { status: 400 });
  }
  const date = body.date ?? existing.date;
  if (!isValidDate(date)) {
    throw Object.assign(new Error("La fecha debe tener formato válido YYYY-MM-DD."), { status: 400 });
  }
  const categoryValue = body.category ?? existing.category ?? "";
  return {
    type,
    date,
    concept: validateText(body.concept ?? existing.concept, "concept", { required: true, max: 80 }),
    category: type === "expense" ? validateText(categoryValue, "category", { required: true, max: 60 }) : "",
    amount: validateAmount(body.amount ?? existing.amount),
    method: validateText(body.method ?? existing.method, "method", { required: true, max: 40 }),
    notes: validateText(body.notes ?? existing.notes ?? "", "notes", { max: 240 }),
  };
}

function validateEquipment(body, existing = {}) {
  const date = body.date ?? existing.date;
  if (!isValidDate(date)) {
    throw Object.assign(new Error("La fecha debe tener formato válido YYYY-MM-DD."), { status: 400 });
  }
  const status = body.status ?? existing.status;
  const validStatuses = ["Planeado", "Comprado", "En uso", "En mantenimiento"];
  if (!validStatuses.includes(status)) {
    throw Object.assign(new Error(`El estado debe ser uno de: ${validStatuses.join(", ")}.`), { status: 400 });
  }
  return {
    name: validateText(body.name ?? existing.name, "name", { required: true, max: 80 }),
    type: validateText(body.type ?? existing.type, "type", { required: true, max: 60 }),
    date,
    amount: validateAmount(body.amount ?? existing.amount, { allowZero: true }),
    supplier: validateText(body.supplier ?? existing.supplier ?? "", "supplier", { max: 80 }),
    method: validateText(body.method ?? existing.method ?? "", "method", { max: 40 }),
    status,
  };
}

function notFound(label) {
  return Object.assign(new Error(`${label} no encontrado.`), { status: 404 });
}

function createApp(store = mongoStore, isDatabaseConnected = () => mongoose.connection.readyState === 1) {
  const app = express();

  app.use(express.json({ limit: "100kb" }));
  app.use(cors());
  app.use("/api/auth", require("./routes/auth"));

  app.get("/api/health", async (_request, response, next) => {
    try {
      if (!await isDatabaseConnected()) {
        return response.status(503).json({ status: "error", database: "disconnected" });
      }
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/transactions", async (request, response, next) => {
    const { type, month } = request.query;
    if (type !== undefined && !["income", "expense"].includes(type)) {
      return response.status(400).json({ error: "El filtro type debe ser 'income' o 'expense'." });
    }
    if (month !== undefined && !isValidMonth(month)) {
      return response.status(400).json({ error: "El filtro month debe tener formato YYYY-MM." });
    }
    try {
      response.json(await store.listTransactions({ type, month }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/transactions", async (request, response, next) => {
    try {
      const transaction = validateTransaction(request.body || {});
      response.status(201).json(await store.createTransaction(transaction));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/transactions/:id", async (request, response, next) => {
    try {
      const record = await store.getTransaction(request.params.id);
      if (!record) return response.status(404).json({ error: "Movimiento no encontrado." });
      response.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/transactions/:id", async (request, response, next) => {
    try {
      const current = await store.getTransaction(request.params.id);
      if (!current) return response.status(404).json({ error: "Movimiento no encontrado." });
      const transaction = validateTransaction(request.body || {}, current);
      const updated = await store.updateTransaction(request.params.id, transaction);
      if (!updated) return response.status(404).json({ error: "Movimiento no encontrado." });
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/transactions/:id", async (request, response, next) => {
    try {
      if (!await store.deleteTransaction(request.params.id)) {
        return response.status(404).json({ error: "Movimiento no encontrado." });
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/equipment", async (_request, response, next) => {
    try {
      response.json(await store.listEquipment());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/equipment", async (request, response, next) => {
    try {
      const equipment = validateEquipment(request.body || {});
      response.status(201).json(await store.createEquipment(equipment));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/equipment/:id", async (request, response, next) => {
    try {
      const current = await store.getEquipment(request.params.id);
      if (!current) return response.status(404).json({ error: "Equipo no encontrado." });
      const equipment = validateEquipment(request.body || {}, current);
      const updated = await store.updateEquipment(request.params.id, equipment);
      if (!updated) return response.status(404).json({ error: "Equipo no encontrado." });
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/equipment/:id", async (request, response, next) => {
    try {
      if (!await store.deleteEquipment(request.params.id)) {
        return response.status(404).json({ error: "Equipo no encontrado." });
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/investment-fund", async (request, response, next) => {
    const { month } = request.query;
    if (month !== undefined && !isValidMonth(month)) {
      return response.status(400).json({ error: "El filtro month debe tener formato YYYY-MM." });
    }
    try {
      response.json(await store.listInvestmentFund(month));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/investment-fund", async (request, response, next) => {
    try {
      const body = request.body || {};
      if (!isValidMonth(body.month)) {
        return response.status(400).json({ error: "El mes debe tener formato YYYY-MM." });
      }
      const amount = validateAmount(body.amount, { allowZero: true });
      response.json(await store.setInvestmentFund(body.month, amount));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard", async (request, response, next) => {
    const month = request.query.month || new Date().toISOString().slice(0, 7);
    if (!isValidMonth(month)) {
      return response.status(400).json({ error: "El mes debe tener formato YYYY-MM." });
    }
    try {
      response.json(await store.dashboard(month));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/monthly-summary", async (request, response, next) => {
    const year = request.query.year || String(new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) {
      return response.status(400).json({ error: "El año debe tener cuatro dígitos." });
    }
    try {
      response.json(await store.monthlySummary(year));
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "Ruta de API no encontrada." });
  });

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/", (_request, response) => {
    response.sendFile(path.join(__dirname, "public", "index.html"));
  });
  app.get("/app.js", (_request, response) => {
    response.sendFile(path.join(__dirname, "app.js"));
  });
  app.get("/favicon.ico", (_request, response) => response.status(204).end());

  app.use((error, _request, response, _next) => {
    if (!error.status || error.status >= 500) console.error(error);
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "El cuerpo de la solicitud debe ser JSON válido." });
    }
    response.status(error.status || 500).json({
      error: error.status ? error.message : "Error interno del servidor.",
    });
  });

  return app;
}

const app = createApp();

async function startServer() {
  await conectarDB();
  const server = app.listen(port, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      console.error("El servidor empezó a escuchar, pero no se pudo determinar el puerto.");
      return;
    }
    console.log(`MAEJ INOUT disponible en http://localhost:${address.port}`);
    console.log(`API REST disponible en http://localhost:${address.port}/api`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`El puerto ${port} ya está ocupado. Detén la otra instancia o configura otro puerto.`);
    } else {
      console.error("No se pudo iniciar el servidor:", error);
    }
    process.exitCode = 1;
  });

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("No se pudo conectar a MongoDB Atlas; el servidor no se inició:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, createApp, startServer };
