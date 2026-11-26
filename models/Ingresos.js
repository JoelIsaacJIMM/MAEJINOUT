const crypto = require("node:crypto");
const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  companyId: { type: String, required: true, default: "default" },
  type: { type: String, enum: ["income"], default: "income" },
  date: { type: String, required: true },
  concept: { type: String, required: true, maxlength: 80 },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, required: true, maxlength: 40 },
  notes: { type: String, default: "", maxlength: 240 },
}, { timestamps: true, versionKey: false });

schema.index({ companyId: 1, date: -1 });

module.exports = mongoose.model("Ingreso", schema, "ingresos");

