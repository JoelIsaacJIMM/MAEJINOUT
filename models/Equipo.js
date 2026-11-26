const crypto = require("node:crypto");
const mongoose = require("mongoose");

const equipoSchema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  companyId: { type: String, required: true, default: "default" },
  name: { type: String, required: true, maxlength: 80 },
  type: { type: String, required: true, maxlength: 60 },
  date: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  supplier: { type: String, default: "", maxlength: 80 },
  method: { type: String, default: "", maxlength: 40 },
  status: {
    type: String,
    required: true,
    enum: ["Planeado", "Comprado", "En uso", "En mantenimiento"],
  },
}, { timestamps: true, versionKey: false });

equipoSchema.index({ companyId: 1, date: -1 });

module.exports = mongoose.model("Equipo", equipoSchema, "equipment");
