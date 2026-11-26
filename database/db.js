const mongoose = require('mongoose');

async function conectarDB() {
    const mongoUri = process.env.MONGO_URI?.trim();
    if (!mongoUri) {
        throw new Error('Falta configurar MONGO_URI en el archivo .env.');
    }
    await mongoose.connect(mongoUri, {
        dbName: process.env.MONGO_DB_NAME || 'maej_inout',
        serverSelectionTimeoutMS: 10000
    });
    console.log(`Conectado a MongoDB Atlas (${mongoose.connection.name})`);
}

module.exports = conectarDB;