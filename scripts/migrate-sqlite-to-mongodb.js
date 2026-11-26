require("dotenv").config();
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const conectarDB = require("../database/db");
const Movimiento = require("../models/Movimiento");
const Equipo = require("../models/Equipo");
const FondoInversion = require("../models/FondoInversion");

const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, "..", "data", "maej-inout.sqlite");

function parseSqliteTimestamp(value) {
  if (!value) return undefined;
  const timestamp = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function toUpsert(document) {
  const {
    id,
    company_id: companyId,
    created_at: createdAt,
    updated_at: updatedAt,
    ...fields
  } = document;
  const migratedDocument = { _id: id, companyId, ...fields };
  const migratedCreatedAt = parseSqliteTimestamp(createdAt);
  const migratedUpdatedAt = parseSqliteTimestamp(updatedAt);
  if (migratedCreatedAt) migratedDocument.createdAt = migratedCreatedAt;
  if (migratedUpdatedAt) migratedDocument.updatedAt = migratedUpdatedAt;
  return {
    updateOne: {
      filter: { _id: id },
      update: { $setOnInsert: migratedDocument },
      upsert: true,
    },
  };
}

function toFundUpsert({ company_id: companyId, month, amount, created_at: createdAt, updated_at: updatedAt }) {
  const migratedDocument = { companyId, month, amount };
  const migratedCreatedAt = parseSqliteTimestamp(createdAt);
  const migratedUpdatedAt = parseSqliteTimestamp(updatedAt);
  if (migratedCreatedAt) migratedDocument.createdAt = migratedCreatedAt;
  if (migratedUpdatedAt) migratedDocument.updatedAt = migratedUpdatedAt;
  return {
    updateOne: {
      filter: { companyId, month },
      update: { $setOnInsert: migratedDocument },
      upsert: true,
    },
  };
}

async function migrateCollection(Model, rows, label) {
  if (!rows.length) {
    console.log(`${label}: 0 registros para migrar.`);
    return;
  }
  const result = await Model.bulkWrite(rows.map(toUpsert), { ordered: false, timestamps: false });
  console.log(`${label}: ${result.upsertedCount} migrados; ${result.matchedCount} ya existían.`);
}

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`No se encontró la base SQLite de origen: ${databasePath}`);
  }

  const sqlite = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const transactions = sqlite.prepare("SELECT * FROM transactions").all();
    const equipment = sqlite.prepare("SELECT * FROM equipment").all();
    const funds = sqlite.prepare("SELECT * FROM investment_fund").all();

    await conectarDB();
    await migrateCollection(Movimiento, transactions, "Movimientos");
    await migrateCollection(Equipo, equipment, "Equipos");

    if (funds.length) {
      const operations = funds.map(toFundUpsert);
      const result = await FondoInversion.bulkWrite(operations, { ordered: false, timestamps: false });
      console.log(`Fondos: ${result.upsertedCount} migrados; ${result.matchedCount} ya existían.`);
    } else {
      console.log("Fondos: 0 registros para migrar.");
    }
  } finally {
    sqlite.close();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("No se pudo completar la migración:", error.message);
  process.exitCode = 1;
});
