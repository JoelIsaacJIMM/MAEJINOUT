const mongoose = require('mongoose');

const sesionSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    index: true
  },
  tokenHash: { type: String, required: true, unique: true },
  expira: { type: Date, required: true }
}, { timestamps: true });

sesionSchema.index({ expira: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Sesion', sesionSchema, "sesiones");
