require('dotenv').config();
const bot = require('./lib/bot');
const { connectDB } = require('./lib/db');

async function start() {
  try {
    // Подключаемся к MongoDB
    await connectDB();
    console.log('✅ MongoDB подключена');

    // Запускаем бота в режиме long polling
    await bot.launch();
    console.log('🚀 Бот запущен (long polling)');
    console.log('👉 Открой Telegram и напиши боту /start');

    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (e) {
    console.error('❌ Ошибка запуска:', e);
    process.exit(1);
  }
}

start();