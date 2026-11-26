const express = require("express");
const crypto = require("node:crypto");
const Usuario = require("../models/Usuarios");
const Sesion = require("../models/Sesion");
const { verifyPassword } = require("../utils/password");

const router = express.Router();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/register", (_request, response) => {
  response.status(403).json({ error: "El registro público está deshabilitado. Solicita una cuenta al administrador." });
});

router.post("/login", async (request, response) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const usuario = await Usuario.findOne({ email }).select("+passwordHash");
    if (!usuario || !verifyPassword(password, usuario.passwordHash)) {
      return response.status(401).json({ error: "Correo o contraseña incorrectos." });
    }
    //verificacion de passsword
    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashToken(token);
    await Sesion.create({
      usuario: usuario._id,
      tokenHash: hashedToken,
      expira: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    response.json({ token, 
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } });
  } catch (error) {
    response.status(500).json({ error: "No se pudo iniciar sesión." });
  }
});

router.post("/logout", async (request, response) => {
  try {
    const auth = request.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) {
      await Sesion.deleteOne({ tokenHash: hashToken(token) });
    }
    response.status(204).end();
  } catch (error) {
    response.status(500).json({ error: "No se pudo cerrar sesión." });
  }
});

router.get("/session", async (request, response) => {
  try {
    const auth = request.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return response.status(401).json({ error: "No se proporcionó un token de sesión." });
    }
    const sesion = await Sesion.findOne({
      tokenHash: hashToken(token),
      expira: { $gt: new Date() }
    }).populate("usuario", "nombre email");

    if (!sesion || !sesion.usuario) {
      return response.status(401).json({ error: "Sesión no válida." });
    }

    response.json({
      user: {
        id: sesion.usuario.id,
        nombre: sesion.usuario.nombre,
        email: sesion.usuario.email
      }
    });
   
  } catch (error) {
    response.status(500).json({ error: "No se pudo obtener la sesión." });
  }
});

module.exports = router;
