const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db('ebla');
    console.log('✅ MongoDB подключена');
  }
  return db;
}

async function getCollection(name) {
  const database = await connectDB();
  return database.collection(name);
}

module.exports = { connectDB, getCollection };
