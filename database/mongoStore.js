const mongoose = require("mongoose");
const Ingreso = require("../models/Ingresos");
const Gasto = require("../models/Gastos");
const Equipo = require("../models/Equipo");
const FondoInversion = require("../models/FondoInversion");

const companyId = "default";

function modelForType(type) {
  if (type === "income") return Ingreso;
  if (type === "expense") return Gasto;
  throw new Error(`Tipo de movimiento desconocido: ${type}`);
}

function toRecord(document) {
  if (!document) return null;

  const record = document.toObject ? document.toObject() : document;
  const {
    _id,
    companyId: _companyId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...fields
  } = record;

  return { id: String(_id), ...fields };
}

async function findTransaction(id) {
  const [income, expense] = await Promise.all([
    Ingreso.findOne({ _id: id, companyId }).lean(),
    Gasto.findOne({ _id: id, companyId }).lean(),
  ]);

  if (income) return { Model: Ingreso, record: income };
  if (expense) return { Model: Gasto, record: expense };
  return null;
}

function sumByType(transactions, type) {
  return transactions.reduce(
    (sum, transaction) =>
      sum + (transaction.type === type ? transaction.amount : 0),
    0,
  );
}

function getInvestmentFund(funds, month) {
  return funds
    .filter((fund) => fund.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month))[0]?.amount ?? 0;
}

module.exports = {
  async listTransactions({ type, month }) {
    const filter = { companyId };

    if (month) {
      filter.date = { $gte: `${month}-01`, $lt: `${month}-32` };
    }

    const models = type ? [modelForType(type)] : [Ingreso, Gasto];
    const results = await Promise.all(
      models.map((Model) => Model.find(filter).lean()),
    );

    return results
      .flat()
      .map(toRecord)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  async createTransaction(fields) {
    const Model = modelForType(fields.type);
    const document = await Model.create({ ...fields, companyId });
    return toRecord(document);
  },

  async getTransaction(id) {
    const result = await findTransaction(id);
    return result ? toRecord(result.record) : null;
  },

  async updateTransaction(id, fields) {
    const current = await findTransaction(id);
    if (!current) return null;

    const TargetModel = modelForType(fields.type);

    if (current.Model === TargetModel) {
      const updated = await TargetModel.findOneAndUpdate(
        { _id: id, companyId },
        fields,
        { new: true, runValidators: true },
      ).lean();

      return toRecord(updated);
    }

    const session = await mongoose.startSession();
    let updated = null;

    try {
      await session.withTransaction(async () => {
        const existing = await current.Model
          .findOne({ _id: id, companyId })
          .session(session);

        if (!existing) return;

        await current.Model.deleteOne({ _id: id, companyId }, { session });

        const [created] = await TargetModel.create(
          [{ ...fields, _id: id, companyId }],
          { session },
        );

        updated = created;
      });

      return toRecord(updated);
    } finally {
      await session.endSession();
    }
  },

  async deleteTransaction(id) {
    const [incomeResult, expenseResult] = await Promise.all([
      Ingreso.deleteOne({ _id: id, companyId }),
      Gasto.deleteOne({ _id: id, companyId }),
    ]);

    return incomeResult.deletedCount > 0 || expenseResult.deletedCount > 0;
  },

  async listEquipment() {
    const records = await Equipo.find({ companyId }).sort({ date: -1 }).lean();
    return records.map(toRecord);
  },

  async createEquipment(fields) {
    const document = await Equipo.create({ ...fields, companyId });
    return toRecord(document);
  },

  async getEquipment(id) {
    const record = await Equipo.findOne({ _id: id, companyId }).lean();
    return toRecord(record);
  },

  async updateEquipment(id, fields) {
    const record = await Equipo.findOneAndUpdate(
      { _id: id, companyId },
      fields,
      { new: true, runValidators: true },
    ).lean();

    return toRecord(record);
  },

  async deleteEquipment(id) {
    const result = await Equipo.deleteOne({ _id: id, companyId });
    return result.deletedCount > 0;
  },

  async listInvestmentFund(month) {
    const filter = { companyId };
    if (month) filter.month = month;

    const records = await FondoInversion.find(filter).sort({ month: 1 }).lean();
    return records.map(({ month: recordMonth, amount }) => ({
      month: recordMonth,
      amount,
    }));
  },

  async setInvestmentFund(month, amount) {
    const record = await FondoInversion.findOneAndUpdate(
      { companyId, month },
      { $set: { amount }, $setOnInsert: { companyId, month } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    return { month: record.month, amount: record.amount };
  },

  async dashboard(month) {
    const dateFilter = {
      companyId,
      date: { $gte: `${month}-01`, $lt: `${month}-32` },
    };

    const [incomes, expenses, funds] = await Promise.all([
      Ingreso.find(dateFilter).lean(),
      Gasto.find(dateFilter).lean(),
      FondoInversion.find({ companyId, month: { $lte: month } }).lean(),
    ]);

    const transactions = [...incomes, ...expenses];
    const income = sumByType(transactions, "income");
    const expenseTotal = sumByType(transactions, "expense");

    return {
      month,
      income,
      expenses: expenseTotal,
      profit: income - expenseTotal,
      investmentFund: getInvestmentFund(funds, month),
    };
  },

  async monthlySummary(year) {
    const firstMonth = `${year}-01`;
    const lastMonth = `${year}-12`;
    const dateFilter = {
      companyId,
      date: { $gte: `${year}-01-01`, $lt: `${year}-13-01` },
    };

    const [incomes, expenses, funds] = await Promise.all([
      Ingreso.find(dateFilter).lean(),
      Gasto.find(dateFilter).lean(),
      FondoInversion.find({ companyId, month: { $lte: lastMonth } }).lean(),
    ]);

    const transactions = [...incomes, ...expenses];
    const months = new Set([
      ...transactions.map((transaction) => transaction.date.slice(0, 7)),
      ...funds
        .filter((fund) => fund.month >= firstMonth && fund.month <= lastMonth)
        .map((fund) => fund.month),
    ]);

    return [...months]
      .sort((a, b) => b.localeCompare(a))
      .map((month) => {
        const monthTransactions = transactions.filter(
          (transaction) => transaction.date.startsWith(month),
        );
        const income = sumByType(monthTransactions, "income");
        const expenseTotal = sumByType(monthTransactions, "expense");

        return {
          month,
          income,
          expenses: expenseTotal,
          investmentFund: getInvestmentFund(funds, month),
          profit: income - expenseTotal,
        };
      });
  },
};