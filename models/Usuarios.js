const mongoose = require("mongoose");

const UsuariosSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
  passwordHash: { type: String, required: true, select: false },
  fecharegistro: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Usuario", UsuariosSchema);