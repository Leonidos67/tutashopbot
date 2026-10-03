const { Telegraf } = require('telegraf');
const { getCollection } = require('./db');
const keyboards = require('./keyboards');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ============= MIDDLEWARE =============
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.chat?.type === 'private') {
    const users = await getCollection('users');
    const { id, username, first_name } = ctx.from;

    const user = await users.findOne({ id });
    if (!user) {
      let referrerId = null;
      if (ctx.startPayload?.startsWith('ref_')) {
        referrerId = parseInt(ctx.startPayload.replace('ref_', ''));
        if (referrerId === id) referrerId = null;
      }
      await users.insertOne({
        id,
        username,
        first_name,
        referrer_id: referrerId,
        balance: 0,
        created_at: new Date()
      });
    }
  }
  return next();
});

// ============= КОМАНДЫ =============
bot.start(async (ctx) => {
  await ctx.reply(
    `Привет, ${ctx.from.first_name}!\n\n` +
    `Здесь ты можешь купить доступ к эксклюзивным видео.\n` +
    `Выбирай в каталоге.`,
    keyboards.mainMenu()
  );
});

bot.action('catalog', async (ctx) => {
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();

  if (!list.length) return ctx.answerCbQuery('Каталог пуст');

  await ctx.editMessageText(
    '📁 Выбери видео:',
    keyboards.catalogMenu(list)
  );
});

bot.action('profile', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: ctx.from.id });

  const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;

  await ctx.editMessageText(
    `👤 Профиль\n\n` +
    `🆔 ID: ${user.id}\n` +
    `💰 Баланс: ${user.balance}⭐\n\n` +
    `🔗 Твоя реферальная ссылка:\n${refLink}`,
    keyboards.mainMenu()
  );
});

// ============= ПОКУПКА =============
bot.action(/buy_(.+)/, async (ctx) => {
  const slug = ctx.match[1];
  const videos = await getCollection('videos');
  const video = await videos.findOne({ slug });

  if (!video) return ctx.answerCbQuery('Видео не найдено');

  await ctx.replyWithInvoice({
    title: video.title,
    description: `Доступ к видео "${video.title}"`,
    payload: `video_${video._id.toString()}`,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: video.title, amount: video.price }]
  });
});

// ============= ПОДТВЕРЖДЕНИЕ ОПЛАТЫ =============
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// ============= УСПЕШНАЯ ОПЛАТА =============
bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const videoId = payment.invoice_payload.replace('video_', '');
  const userId = ctx.from.id;

  const payments = await getCollection('payments');
  const videos = await getCollection('videos');
  const users = await getCollection('users');

  // Записываем платеж
  await payments.insertOne({
    user_id: userId,
    video_id: videoId,
    amount: payment.total_amount,
    telegram_payment_id: payment.telegram_payment_charge_id,
    status: 'success',
    created_at: new Date()
  });

  // Получаем видео
  const video = await videos.findOne({ _id: videoId });

  // Выдаем ссылку
  await ctx.reply(
    `✅ Оплата прошла!\n\n` +
    `Твоя ссылка на видео:\n${video.video_url}\n\n` +
    `⚠️ Не передавай ссылку никому.`,
    keyboards.mainMenu()
  );

  // Бонус рефереру
  const user = await users.findOne({ id: userId });
  if (user?.referrer_id) {
    await users.updateOne(
      { id: user.referrer_id },
      { $inc: { balance: 10 } }
    );
  }
});

// ============= АДМИН =============
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== parseInt(process.env.ADMIN_ID)) return;

  const users = await getCollection('users');
  const payments = await getCollection('payments');

  const usersCount = await users.countDocuments();
  const paymentsCount = await payments.countDocuments({ status: 'success' });

  await ctx.reply(
    `👑 Админ-панель\n\n` +
    `👥 Пользователей: ${usersCount}\n` +
    `💳 Успешных платежей: ${paymentsCount}`
  );
});

module.exports = bot;