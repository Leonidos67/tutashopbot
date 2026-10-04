const { Telegraf, Markup } = require('telegraf');
const { getCollection } = require('./db');
const keyboards = require('./keyboards');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ============= КОНСТАНТЫ =============
const REFERRAL_PERCENT = 10;        // 10% от покупки идёт рефереру
const MIN_WITHDRAW = 100;           // минимум для вывода (в звёздах)
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// ============= MIDDLEWARE =============
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.chat?.type === 'private') {
    const users = await getCollection('users');
    const { id, username, first_name } = ctx.from;
    const userId = parseInt(id);

    const user = await users.findOne({ id: userId });

    // Обработка реферальной ссылки
    let referrerId = null;
    if (ctx.startPayload?.startsWith('ref_')) {
      referrerId = parseInt(ctx.startPayload.replace('ref_', ''));
      if (referrerId === userId) referrerId = null;
    }

    if (!user) {
      // Новый юзер
      await users.insertOne({
        id: userId,
        username: username || '',
        first_name: first_name || '',
        referrer_id: referrerId,
        balance: 0,
        has_purchased: false,
        referral_count: 0,
        referral_earnings: 0,
        created_at: new Date()
      });

      if (referrerId) {
        await users.updateOne(
          { id: referrerId },
          { $inc: { referral_count: 1 } }
        );
        try {
          await ctx.telegram.sendMessage(
            referrerId,
            `🎉 По твоей ссылке пришёл новый пользователь!\n\n` +
            `Как только он купит видео — ты получишь ${REFERRAL_PERCENT}% от суммы.`
          );
        } catch (e) {}
      }
    } else {
      // Юзер УЖЕ существует — проверяем, можно ли записать реферера
      if (referrerId && !user.referrer_id && !user.has_purchased) {
        // Если у юзера ещё нет реферера и он ещё не покупал — записываем
        await users.updateOne(
          { id: userId },
          { $set: { referrer_id: referrerId } }
        );
        await users.updateOne(
          { id: referrerId },
          { $inc: { referral_count: 1 } }
        );
        try {
          await ctx.telegram.sendMessage(
            referrerId,
            `🎉 По твоей ссылке пришёл новый пользователь!\n\n` +
            `Как только он купит видео — ты получишь ${REFERRAL_PERCENT}% от суммы.`
          );
        } catch (e) {}
      }
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

bot.action('main_menu', async (ctx) => {
  await ctx.editMessageText(
    `Главное меню:`,
    keyboards.mainMenu()
  );
});

// ============= ПРОФИЛЬ =============
bot.action('profile', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });

  if (!user) return ctx.answerCbQuery('Ошибка');

  const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;
  const refCount = user.referral_count || 0;
  const balance = user.balance || 0;
  const earnings = user.referral_earnings || 0;

  let text =
    `👤 Твой профиль\n\n` +
    `🆔 ID: ${user.id}\n` +
    `👥 Приглашено друзей: ${refCount}\n` +
    `💰 Баланс: ${balance}⭐\n` +
    `📈 Всего заработано: ${earnings}⭐\n\n` +
    `🔗 Твоя реферальная ссылка:\n${refLink}\n\n` +
    `💡 За каждую покупку друга ты получаешь ${REFERRAL_PERCENT}% от суммы.\n` +
    `Вывод доступен от ${MIN_WITHDRAW}⭐.`;

  const buttons = [];
  if (balance >= MIN_WITHDRAW) {
    buttons.push([Markup.button.callback('💸 Вывести', 'withdraw')]);
  }
  buttons.push([Markup.button.callback('« Назад', 'main_menu')]);

  await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
});

// ============= ЗАПРОС НА ВЫВОД =============
bot.action('withdraw', async (ctx) => {
  const users = await getCollection('users');
  const withdrawals = await getCollection('withdrawals');
  const userId = parseInt(ctx.from.id);

  const user = await users.findOne({ id: userId });
  if (!user || user.balance < MIN_WITHDRAW) {
    return ctx.answerCbQuery('Недостаточно средств');
  }

  const amount = user.balance;

  // Списываем баланс
  await users.updateOne(
    { id: userId },
    { $inc: { balance: -amount } }
  );

  // Записываем заявку
  await withdrawals.insertOne({
    user_id: userId,
    username: user.username,
    first_name: user.first_name,
    amount: amount,
    status: 'pending',
    created_at: new Date()
  });

  await ctx.editMessageText(
    `✅ Заявка на вывод создана!\n\n` +
    `Сумма: ${amount}⭐\n` +
    `Статус: в обработке\n\n` +
    `Админ свяжется с тобой в течение 24 часов.`,
    Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'main_menu')]])
  );

  // Уведомление админу
  try {
    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `💸 НОВАЯ ЗАЯВКА НА ВЫВОД\n\n` +
      `👤 ${user.first_name} (@${user.username || '—'})\n` +
      `🆔 ${userId}\n` +
      `💰 Сумма: ${amount}⭐\n\n` +
      `Напиши ему: tg://user?id=${userId}`
    );
  } catch (e) { console.error('Не удалось уведомить админа', e); }
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
  const userId = parseInt(ctx.from.id);
  const amount = payment.total_amount;

  const users = await getCollection('users');
  const videos = await getCollection('videos');
  const payments = await getCollection('payments');

  // Записываем платёж
  await payments.insertOne({
    user_id: userId,
    video_id: videoId,
    amount: amount,
    telegram_payment_id: payment.telegram_payment_charge_id,
    status: 'success',
    created_at: new Date()
  });

  // Получаем видео
  const video = await videos.findOne({ _id: videoId });
  if (!video) return ctx.reply('Ошибка: видео не найдено');

  // Выдаём ссылку покупателю
  await ctx.reply(
    `✅ Оплата прошла!\n\n` +
    `Твоя ссылка на видео "${video.title}":\n${video.video_url}\n\n` +
    `⚠️ Не передавай ссылку никому.`,
    keyboards.mainMenu()
  );

  // ============= НАЧИСЛЕНИЕ РЕФЕРЕРУ =============
  const buyer = await users.findOne({ id: userId });

  if (buyer && buyer.referrer_id) {
    // 10% от суммы покупки
    const bonus = Math.floor(amount * REFERRAL_PERCENT / 100);

    await users.updateOne(
      { id: buyer.referrer_id },
      {
        $inc: {
          balance: bonus,
          referral_earnings: bonus
        }
      }
    );

    // Помечаем покупателя как купившего
    await users.updateOne(
      { id: userId },
      { $set: { has_purchased: true } }
    );

    // Уведомляем реферера
    try {
      await ctx.telegram.sendMessage(
        buyer.referrer_id,
        `💰 Твой реферал купил видео!\n\n` +
        `Сумма покупки: ${amount}⭐\n` +
        `Твой доход: +${bonus}⭐ (${REFERRAL_PERCENT}%)`
      );
    } catch (e) {}
  }

  // ============= УВЕДОМЛЕНИЕ АДМИНУ =============
  try {
    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `💳 НОВАЯ ОПЛАТА\n\n` +
      `👤 ${ctx.from.first_name} (@${ctx.from.username || '—'})\n` +
      `🆔 ${userId}\n` +
      `🎬 Видео: ${video.title}\n` +
      `💰 Сумма: ${amount}⭐\n` +
      `🔗 Ссылка на юзера: tg://user?id=${userId}`
    );
  } catch (e) { console.error('Не удалось уведомить админа', e); }
});

// ============= АДМИН =============
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const users = await getCollection('users');
  const payments = await getCollection('payments');
  const withdrawals = await getCollection('withdrawals');

  const usersCount = await users.countDocuments();
  const paymentsCount = await payments.countDocuments({ status: 'success' });

  // Общая сумма платежей
  const totalAgg = await payments.aggregate([
    { $match: { status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).toArray();
  const totalAmount = totalAgg[0]?.total || 0;

  // Заявки на вывод
  const pendingWithdrawals = await withdrawals.find({ status: 'pending' }).toArray();

  let text =
    `👑 Админ-панель\n\n` +
    `👥 Пользователей: ${usersCount}\n` +
    `💳 Платежей: ${paymentsCount}\n` +
    `💰 Общая сумма: ${totalAmount}⭐\n\n` +
    `💸 Заявок на вывод: ${pendingWithdrawals.length}\n`;

  if (pendingWithdrawals.length > 0) {
    text += `\nПоследние:\n`;
    pendingWithdrawals.slice(0, 5).forEach(w => {
      text += `• ${w.first_name} (@${w.username || '—'}) — ${w.amount}⭐\n`;
    });
  }

  text += `\n\nКоманды:\n` +
    `/withdrawals — все заявки\n` +
    `/approve ID — подтвердить вывод\n` +
    `/reject ID — отклонить вывод`;

  await ctx.reply(text);
});

// Список заявок
bot.command('withdrawals', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const withdrawals = await getCollection('withdrawals');
  const list = await withdrawals.find({ status: 'pending' }).toArray();

  if (!list.length) return ctx.reply('Нет активных заявок');

  let text = `💸 Заявки на вывод:\n\n`;
  list.forEach(w => {
    text += `ID: ${w._id}\n` +
      `👤 ${w.first_name} (@${w.username || '—'})\n` +
      `🆔 ${w.user_id}\n` +
      `💰 ${w.amount}⭐\n\n`;
  });

  await ctx.reply(text);
});

// Подтвердить вывод
bot.command('approve', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /approve ID');

  const { ObjectId } = require('mongodb');
  const withdrawals = await getCollection('withdrawals');

  await withdrawals.updateOne(
    { _id: new ObjectId(args[1]) },
    { $set: { status: 'approved', approved_at: new Date() } }
  );

  ctx.reply('✅ Заявка подтверждена');
});

// Отклонить вывод
bot.command('reject', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /reject ID');

  const { ObjectId } = require('mongodb');
  const withdrawals = await getCollection('withdrawals');
  const users = await getCollection('users');

  const withdrawal = await withdrawals.findOne({ _id: new ObjectId(args[1]) });
  if (!withdrawal) return ctx.reply('Заявка не найдена');

  // Возвращаем баланс
  await users.updateOne(
    { id: withdrawal.user_id },
    { $inc: { balance: withdrawal.amount } }
  );

  await withdrawals.updateOne(
    { _id: new ObjectId(args[1]) },
    { $set: { status: 'rejected', rejected_at: new Date() } }
  );

  ctx.reply('❌ Заявка отклонена, баланс возвращён');
});

module.exports = bot;