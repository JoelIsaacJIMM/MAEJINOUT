const mongoose = require("mongoose");

const fondoInversionSchema = new mongoose.Schema({
  companyId: { type: String, required: true, default: "default" },
  month: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
}, { timestamps: true, versionKey: false });

fondoInversionSchema.index({ companyId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("FondoInversion", fondoInversionSchema, "investment_fund");
