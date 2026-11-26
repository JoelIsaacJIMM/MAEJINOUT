require("dotenv").config();
const readline = require("node:readline/promises");
const mongoose = require("mongoose");
const Usuario = require("../models/Usuarios");
const conectarDB = require("../database/db");
const { hashPassword } = require("../utils/password");

async function promptForPassword(message) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Ejecuta este comando desde una terminal interactiva para ingresar la contraseña de forma segura.");
  }

  process.stdout.write(message);
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let password = "";
    const finish = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish();
          process.stdout.write("\n");
          reject(new Error("Operación cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          process.stdout.write("\n");
          resolve(password);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = Array.from(password).slice(0, -1).join("");
        } else if (character >= " ") {
          password += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const prompts = readline.createInterface({ input: process.stdin, output: process.stdout });
  let nombre;
  let email;
  try {
    nombre = (await prompts.question("Nombre: ")).trim();
    email = (await prompts.question("Correo: ")).trim().toLowerCase();
  } finally {
    prompts.close();
  }

  if (!nombre || nombre.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new Error("Ingresa un nombre y un correo válidos.");
  }

  const password = await promptForPassword("Contraseña (mínimo 12 caracteres, no se mostrará): ");
  if (password.length < 12) {
    throw new Error("La contraseña debe tener al menos 12 caracteres.");
  }

  try {
    await conectarDB();
    const usuario = await Usuario.create({ nombre, email, passwordHash: hashPassword(password) });
    console.log(`Usuario ${usuario.email} creado.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  if (error.code === 11000) {
    console.error("Ya existe una cuenta con ese correo.");
  } else {
    console.error("No se pudo crear el usuario:", error.message);
  }
  process.exitCode = 1;
});
