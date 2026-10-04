const { Telegraf, Markup } = require('telegraf');
const { getCollection } = require('./db');
const { mainMenu, backToMenu } = require('./keyboards');
const { checkRateLimit, isSuspiciousUser, applyDiscount } = require('./helpers');
const { ObjectId } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ==================== КОНСТАНТЫ ====================
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const SUPPORT = process.env.SUPPORT_USERNAME || '@support';
const REF_PERCENT = 10;
const MIN_WITHDRAW = 100;
const SUB_PRICE = 800;
const SUB_DAYS = 30;
const BONUS_COOLDOWN = 24 * 60 * 60 * 1000;
const SURPRISE_CHANCE = 0.1;
const SURPRISE_MIN = 5;
const SURPRISE_MAX = 20;

// ==================== MIDDLEWARE ====================
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat?.type !== 'private') return next();

  const userId = parseInt(ctx.from.id);

  if (!checkRateLimit(userId)) {
    return ctx.reply('⛔ Слишком много запросов. Подожди минуту.');
  }

  if (isSuspiciousUser(ctx.from) && userId !== ADMIN_ID) {
    return ctx.reply(
      `⛔ Доступ заблокирован.\n\n` +
      `Если вы считаете, что произошла ошибка, напишите ${SUPPORT}.`
    );
  }

  const users = await getCollection('users');
  const { username, first_name } = ctx.from;
  let user = await users.findOne({ id: userId });

  let referrerId = null;
  let utmSource = null;
  if (ctx.startPayload) {
    if (ctx.startPayload.startsWith('ref_')) {
      referrerId = parseInt(ctx.startPayload.replace('ref_', ''));
      if (referrerId === userId) referrerId = null;
    } else if (ctx.startPayload.startsWith('utm_')) {
      utmSource = ctx.startPayload.replace('utm_', '');
    }
  }

  if (!user) {
    await users.insertOne({
      id: userId,
      username: username || '',
      first_name: first_name || '',
      referrer_id: referrerId,
      balance: 0,
      has_purchased: false,
      referral_count: 0,
      referral_earnings: 0,
      is_banned: false,
      last_daily_bonus: null,
      last_reminder_sent: null,
      utm_source: utmSource,
      promo_code: null,
      promo_discount: 0,
      created_at: new Date()
    });

    if (referrerId) {
      await users.updateOne({ id: referrerId }, { $inc: { referral_count: 1 } });
      try {
        await ctx.telegram.sendMessage(referrerId,
          `🎉 По твоей ссылке пришёл новый пользователь!\n\n` +
          `Как только он купит видео — ты получишь ${REF_PERCENT}% от суммы.`);
      } catch (e) {}
    }
  } else {
    if (user.is_banned) {
      return ctx.reply(`⛔ Вы забанены.\n\nЕсли считаете, что произошла ошибка, напишите ${SUPPORT}.`);
    }
    if (referrerId && !user.referrer_id && !user.has_purchased) {
      await users.updateOne({ id: userId }, { $set: { referrer_id: referrerId } });
      await users.updateOne({ id: referrerId }, { $inc: { referral_count: 1 } });
      try {
        await ctx.telegram.sendMessage(referrerId,
          `🎉 По твоей ссылке пришёл новый пользователь!\n\n` +
          `Как только он купит видео — ты получишь ${REF_PERCENT}% от суммы.`);
      } catch (e) {}
    }
  }

  return next();
});

// ==================== ГЛАВНОЕ МЕНЮ ====================
bot.start(async (ctx) => {
  await ctx.reply(
    `🎬 Добро пожаловать!\n\n` +
    `Здесь ты можешь купить доступ к эксклюзивным видео.\n\n` +
    `Выбирай, что тебе интересно:`,
    mainMenu()
  );
});

bot.action('main_menu', async (ctx) => {
  await ctx.editMessageText('Главное меню:', mainMenu());
});

bot.action('support', async (ctx) => {
  await ctx.editMessageText(
    `🆘 Поддержка\n\nПо всем вопросам пиши: ${SUPPORT}`,
    backToMenu()
  );
});

// ==================== КАТАЛОГ ====================
bot.action('catalog', async (ctx) => {
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  if (!list.length) return ctx.answerCbQuery('Каталог пуст');

  await ctx.deleteMessage().catch(() => {});
  await sendCatalog(ctx, list, 0);
});

async function sendCatalog(ctx, videos, index) {
  if (index < 0 || index >= videos.length) {
    return ctx.answerCbQuery('Конец каталога');
  }
  const v = videos[index];

  const caption =
    `🎬 ${v.title}\n\n` +
    `💰 Цена: ${v.price}⭐\n` +
    (v.description ? `\n${v.description}\n` : '') +
    `\nВидео ${index + 1} из ${videos.length}`;

  const navButtons = [];
  if (index > 0) navButtons.push(Markup.button.callback('⬅️', `nav_${index - 1}`));
  navButtons.push(Markup.button.callback(`${index + 1}/${videos.length}`, 'noop'));
  if (index < videos.length - 1) navButtons.push(Markup.button.callback('➡️', `nav_${index + 1}`));

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`💳 Купить за ${v.price}⭐`, `buy_${v.slug}`)],
    navButtons,
    [Markup.button.callback('« В меню', 'main_menu')]
  ]);

  if (v.preview_url) {
    await ctx.replyWithPhoto(v.preview_url, { caption, ...keyboard });
  } else {
    await ctx.reply(caption, keyboard);
  }
}

bot.action(/nav_(\d+)/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  await ctx.deleteMessage().catch(() => {});
  await sendCatalog(ctx, list, index);
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

// ==================== ПАКЕТЫ ====================
bot.action('bundles', async (ctx) => {
  const bundles = await getCollection('bundles');
  const list = await bundles.find({ is_active: true }).toArray();
  if (!list.length) {
    return ctx.editMessageText('Пакетов пока нет.', backToMenu());
  }
  const buttons = list.map(b => [
    Markup.button.callback(`${b.title} — ${b.price}⭐`, `buy_bundle_${b.slug}`)
  ]);
  buttons.push([Markup.button.callback('« Назад', 'main_menu')]);
  await ctx.editMessageText('🎁 Пакеты:', Markup.inlineKeyboard(buttons));
});

// ==================== ПОДПИСКА ====================
bot.action('subscription', async (ctx) => {
  const subs = await getCollection('subscriptions');
  const userId = parseInt(ctx.from.id);

  const active = await subs.findOne({
    user_id: userId,
    status: 'active',
    end_date: { $gt: new Date() }
  });

  if (active) {
    const daysLeft = Math.ceil((active.end_date - new Date()) / (24 * 60 * 60 * 1000));
    return ctx.editMessageText(
      `📅 У тебя активна подписка\n\nОсталось: ${daysLeft} дн.\nДо: ${active.end_date.toLocaleDateString('ru-RU')}`,
      backToMenu()
    );
  }

  await ctx.editMessageText(
    `📅 Подписка на месяц\n\nДоступ ко ВСЕМ видео каталога.\n\n` +
    `💰 Цена: ${SUB_PRICE}⭐\n⏱ Срок: ${SUB_DAYS} дней`,
    Markup.inlineKeyboard([
      [Markup.button.callback(`💳 Купить за ${SUB_PRICE}⭐`, 'buy_subscription')],
      [Markup.button.callback('« Назад', 'main_menu')]
    ])
  );
});

bot.action('buy_subscription', async (ctx) => {
  await ctx.replyWithInvoice({
    title: 'Подписка на месяц',
    description: `Доступ ко всем видео на ${SUB_DAYS} дней`,
    payload: 'subscription',
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Подписка', amount: SUB_PRICE }]
  });
});

// ==================== МОИ ВИДЕО ====================
bot.action('my_videos', async (ctx) => {
  const payments = await getCollection('payments');
  const videos = await getCollection('videos');
  const userId = parseInt(ctx.from.id);

  const userPayments = await payments
    .find({ user_id: userId, status: 'success', type: 'video' })
    .sort({ created_at: -1 })
    .toArray();

  if (!userPayments.length) {
    return ctx.editMessageText(
      `🎬 У тебя пока нет купленных видео.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📁 Каталог', 'catalog')],
        [Markup.button.callback('« Назад', 'main_menu')]
      ])
    );
  }

  const videoSlugs = [...new Set(userPayments.map(p => p.video_slug))];
  const purchased = await videos.find({ slug: { $in: videoSlugs } }).toArray();

  let text = `🎬 Твои видео (${purchased.length}):\n\n`;
  purchased.forEach((v, i) => {
    text += `${i + 1}. ${v.title}\n🔗 ${v.video_url}\n\n`;
  });

  await ctx.editMessageText(text, {
    ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'main_menu')]]),
    disable_web_page_preview: true
  });
});

// ==================== ПРОФИЛЬ ====================
bot.action('profile', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;

  const text =
    `👤 Твой профиль\n\n` +
    `🆔 ID: ${user.id}\n` +
    `👥 Друзей: ${user.referral_count || 0}\n` +
    `💰 Баланс: ${user.balance || 0}⭐\n` +
    `📈 Заработано: ${user.referral_earnings || 0}⭐\n\n` +
    `🔗 Реф-ссылка:\n${refLink}\n\n` +
    `💡 За покупку друга ты получаешь ${REF_PERCENT}%.`;

  const buttons = [];
  if ((user.balance || 0) >= MIN_WITHDRAW) {
    buttons.push([Markup.button.callback('💸 Вывести', 'withdraw')]);
  }
  buttons.push([Markup.button.callback('« Назад', 'main_menu')]);

  await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
});

// ==================== ВЫВОД ====================
bot.action('withdraw', async (ctx) => {
  const users = await getCollection('users');
  const withdrawals = await getCollection('withdrawals');
  const userId = parseInt(ctx.from.id);
  const user = await users.findOne({ id: userId });

  if (!user || user.balance < MIN_WITHDRAW) {
    return ctx.answerCbQuery('Недостаточно средств');
  }

  const amount = user.balance;
  await users.updateOne({ id: userId }, { $inc: { balance: -amount } });
  await withdrawals.insertOne({
    user_id: userId,
    username: user.username,
    first_name: user.first_name,
    amount,
    status: 'pending',
    created_at: new Date()
  });

  await ctx.editMessageText(
    `✅ Заявка на вывод создана!\n\nСумма: ${amount}⭐\n\nАдмин свяжется в течение 24 часов.`,
    backToMenu()
  );

  try {
    await ctx.telegram.sendMessage(ADMIN_ID,
      `💸 НОВАЯ ЗАЯВКА НА ВЫВОД\n\n` +
      `👤 ${user.first_name} (@${user.username || '—'})\n` +
      `🆔 ${userId}\n💰 ${amount}⭐\n\n` +
      `Написать: tg://user?id=${userId}`);
  } catch (e) {}
});

// ==================== ЕЖЕДНЕВНЫЙ БОНУС ====================
bot.action('daily_bonus', async (ctx) => {
  const users = await getCollection('users');
  const userId = parseInt(ctx.from.id);
  const user = await users.findOne({ id: userId });

  const now = Date.now();
  if (user.last_daily_bonus) {
    const diff = now - new Date(user.last_daily_bonus).getTime();
    if (diff < BONUS_COOLDOWN) {
      const left = BONUS_COOLDOWN - diff;
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      return ctx.answerCbQuery(`Приходи через ${h}ч ${m}м`, { show_alert: true });
    }
  }

  await ctx.editMessageText(
    `🎲 Ежедневный бонус\n\n` +
    `Бросаем кость (1-6), затем рулетка (х1 - х3).\n\n` +
    `Жми кнопку, чтобы начать!`,
    Markup.inlineKeyboard([[Markup.button.callback('🎲 Бросить кость', 'roll_dice')]])
  );
});

bot.action('roll_dice', async (ctx) => {
  const diceMsg = await ctx.replyWithDice();
  const diceValue = diceMsg.dice.value; // 1-6 для 🎲

  await new Promise(r => setTimeout(r, 3500));

  // Сохраняем значение кости в БД
  const users = await getCollection('users');
  await users.updateOne(
    { id: parseInt(ctx.from.id) },
    { $set: { temp_dice: diceValue } }
  );

  await ctx.reply(
    `🎲 Выпало: ${diceValue}\n\nТеперь рулетка (х1 - х3)...`,
    Markup.inlineKeyboard([[Markup.button.callback('🎰 Крутить', 'roll_slot')]])
  );
});

bot.action('roll_slot', async (ctx) => {
  const slotMsg = await ctx.replyWithDice({ emoji: '🎰' });
  const slotValue = slotMsg.dice.value; // 1, 22, 43, 64

  await new Promise(r => setTimeout(r, 3500));

  // Мапим значение слота (1/22/43/64) на множитель
  const multipliers = {
    1: 1,     // 🍋🍋🍋
    22: 1.5,  // 🍋🍋🍇
    43: 2,    // 🍇🍇🍋
    64: 3     // 💎💎💎
  };
  const multiplier = multipliers[slotValue] || 1;

  const users = await getCollection('users');
  const userId = parseInt(ctx.from.id);
  const user = await users.findOne({ id: userId });

  const diceValue = user.temp_dice || 1;
  const bonus = Math.floor(diceValue * multiplier);

  await users.updateOne(
    { id: userId },
    {
      $inc: { balance: bonus },
      $set: { last_daily_bonus: new Date() },
      $unset: { temp_dice: '' }
    }
  );

  await ctx.reply(
    `🎉 Твой бонус!\n\n🎲 Кость: ${diceValue}\n🎰 Рулетка: х${multiplier}\n💰 Итого: +${bonus}⭐\n\nПриходи через 24 часа!`,
    backToMenu()
  );
});

// ==================== ПРОМОКОДЫ ====================
bot.command('promo', async (ctx) => {
  await ctx.reply(
    `🎟 Введи промокод:\n\nОтправь его следующим сообщением.`,
    Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'main_menu')]])
  );
  // Ждём текстовое сообщение от юзера
  bot.on('text', async (ctx2) => {
    if (ctx2.from.id !== ctx.from.id) return;
    const code = ctx2.message.text.trim().toUpperCase();
    const promos = await getCollection('promocodes');
    const promo = await promos.findOne({ code, is_active: true });

    if (!promo) {
      return ctx2.reply('❌ Промокод не найден или неактивен.');
    }
    if (promo.used >= promo.max_uses) {
      return ctx2.reply('❌ Промокод исчерпан.');
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return ctx2.reply('❌ Промокод истёк.');
    }

    const users = await getCollection('users');
    await users.updateOne(
      { id: parseInt(ctx2.from.id) },
      { $set: { promo_code: promo.code, promo_discount: promo.discount_percent } }
    );

    await ctx2.reply(
      `✅ Промокод активирован!\n\nСкидка: ${promo.discount_percent}%\n\nПрименится при следующей покупке.`,
      mainMenu()
    );
  });
});

// ==================== ПОКУПКА ====================
bot.action(/buy_bundle_(.+)/, async (ctx) => {
  const slug = ctx.match[1];
  const bundles = await getCollection('bundles');
  const bundle = await bundles.findOne({ slug });
  if (!bundle) return ctx.answerCbQuery('Пакет не найден');

  await ctx.replyWithInvoice({
    title: bundle.title,
    description: `Доступ к ${bundle.video_ids.length} видео`,
    payload: `bundle_${bundle._id.toString()}`,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: bundle.title, amount: bundle.price }]
  });
});

bot.action(/buy_(.+)/, async (ctx) => {
  const slug = ctx.match[1];
  const videos = await getCollection('videos');
  const video = await videos.findOne({ slug });
  if (!video) return ctx.answerCbQuery('Видео не найдено');

  const subs = await getCollection('subscriptions');
  const active = await subs.findOne({
    user_id: parseInt(ctx.from.id),
    status: 'active',
    end_date: { $gt: new Date() }
  });

  if (active) {
    return ctx.reply(
      `✅ У тебя активна подписка!\n\nВот ссылка: ${video.video_url}`,
      backToMenu()
    );
  }

  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const discount = user.promo_discount || 0;
  const finalPrice = applyDiscount(video.price, discount);

  // Сохраняем "брошенную корзину"
  const pending = await getCollection('pending_payments');
  await pending.insertOne({
    user_id: parseInt(ctx.from.id),
    video_slug: video.slug,
    video_title: video.title,
    price: finalPrice,
    created_at: new Date(),
    reminded: false
  });

  await ctx.replyWithInvoice({
    title: video.title + (discount ? ` (-${discount}%)` : ''),
    description: `Доступ к видео "${video.title}"`,
    payload: `video_${video._id.toString()}`,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: video.title, amount: finalPrice }]
  });
});

// ==================== ПОДТВЕРЖДЕНИЕ ОПЛАТЫ ====================
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// ==================== УСПЕШНАЯ ОПЛАТА ====================
bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = payment.invoice_payload;
  const userId = parseInt(ctx.from.id);
  const amount = payment.total_amount;

  const users = await getCollection('users');
  const videos = await getCollection('videos');
  const payments = await getCollection('payments');
  const subs = await getCollection('subscriptions');
  const pending = await getCollection('pending_payments');
  const promos = await getCollection('promocodes');

  const user = await users.findOne({ id: userId });

  // ===== ПОДПИСКА =====
  if (payload === 'subscription') {
    const endDate = new Date(Date.now() + SUB_DAYS * 24 * 60 * 60 * 1000);
    await subs.insertOne({
      user_id: userId,
      start_date: new Date(),
      end_date: endDate,
      status: 'active'
    });
    await payments.insertOne({
      user_id: userId,
      type: 'subscription',
      amount,
      telegram_payment_id: payment.telegram_payment_charge_id,
      status: 'success',
      created_at: new Date()
    });

    await ctx.reply(
      `✅ Подписка оформлена!\n\nДо: ${endDate.toLocaleDateString('ru-RU')}\n\nВсе видео доступны бесплатно.`,
      mainMenu()
    );

    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `💳 ПОДПИСКА\n\n👤 ${ctx.from.first_name} (@${ctx.from.username || '—'})\n🆔 ${userId}\n💰 ${amount}⭐`);
    } catch (e) {}
    return;
  }

  // ===== ПАКЕТ =====
  if (payload.startsWith('bundle_')) {
    const bundleId = payload.replace('bundle_', '');
    const bundles = await getCollection('bundles');
    const bundle = await bundles.findOne({ _id: new ObjectId(bundleId) });

    if (bundle) {
      const bundleVideos = await videos.find({ slug: { $in: bundle.video_ids } }).toArray();
      let text = `✅ Пакет "${bundle.title}" куплен!\n\n`;
      bundleVideos.forEach((v, i) => {
        text += `${i + 1}. ${v.title}\n🔗 ${v.video_url}\n\n`;
      });
      text += `⚠️ Не передавай ссылки никому.`;

      await ctx.reply(text, {
        ...mainMenu(),
        disable_web_page_preview: true
      });

      for (const v of bundleVideos) {
        await payments.insertOne({
          user_id: userId,
          video_slug: v.slug,
          video_id: v._id.toString(),
          type: 'video',
          amount: Math.floor(amount / bundleVideos.length),
          bundle: bundle.slug,
          telegram_payment_id: payment.telegram_payment_charge_id,
          status: 'success',
          created_at: new Date()
        });
      }
    }

    // Уведомление админу
    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `💳 ПОКУПКА ПАКЕТА\n\n👤 ${ctx.from.first_name} (@${ctx.from.username || '—'})\n🆔 ${userId}\n🎁 ${bundle?.title}\n💰 ${amount}⭐`);
    } catch (e) {}
    return;
  }

  // ===== ОДНО ВИДЕО =====
  if (payload.startsWith('video_')) {
    const videoId = payload.replace('video_', '');
    const video = await videos.findOne({ _id: new ObjectId(videoId) });
    if (!video) return ctx.reply('Ошибка: видео не найдено');

    // Записываем платёж
    await payments.insertOne({
      user_id: userId,
      video_slug: video.slug,
      video_id: videoId,
      type: 'video',
      amount,
      telegram_payment_id: payment.telegram_payment_charge_id,
      status: 'success',
      created_at: new Date()
    });

    // Выдаём ссылку
    await ctx.reply(
      `✅ Оплата прошла!\n\nТвоя ссылка на видео "${video.title}":\n${video.video_url}\n\n⚠️ Не передавай никому.`,
      mainMenu()
    );

    // Удаляем из "брошенных корзин"
    await pending.deleteMany({ user_id: userId, video_slug: video.slug });

    // Помечаем юзера как купившего + очищаем промокод
    await users.updateOne(
      { id: userId },
      { $set: { has_purchased: true, promo_code: null, promo_discount: 0 } }
    );

    // Увеличиваем счётчик использования промокода
    if (user.promo_code) {
      await promos.updateOne({ code: user.promo_code }, { $inc: { used: 1 } });
    }

    // ===== РЕФЕРАЛЬНЫЙ БОНУС =====
    if (user.referrer_id) {
      const bonus = Math.floor(amount * REF_PERCENT / 100);
      await users.updateOne(
        { id: user.referrer_id },
        { $inc: { balance: bonus, referral_earnings: bonus } }
      );
      try {
        await ctx.telegram.sendMessage(user.referrer_id,
          `💰 Твой реферал купил видео!\n\nСумма: ${amount}⭐\nТвой доход: +${bonus}⭐`);
      } catch (e) {}
    }

    // ===== СЮРПРИЗ =====
    if (Math.random() < SURPRISE_CHANCE) {
      const surprise = Math.floor(Math.random() * (SURPRISE_MAX - SURPRISE_MIN + 1)) + SURPRISE_MIN;
      await users.updateOne({ id: userId }, { $inc: { balance: surprise } });
      await ctx.reply(
        `🎉 Тебе повезло!\n\nБонус-сюрприз: +${surprise}⭐\n\nПроверь баланс в профиле.`
      );
    }

    // Уведомление админу
    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `💳 НОВАЯ ОПЛАТА\n\n👤 ${ctx.from.first_name} (@${ctx.from.username || '—'})\n🆔 ${userId}\n🎬 ${video.title}\n💰 ${amount}⭐`);
    } catch (e) {}
  }
});

// ==================== АДМИН КОМАНДЫ ====================
bot.command('admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const users = await getCollection('users');
  const payments = await getCollection('payments');
  const withdrawals = await getCollection('withdrawals');

  const usersCount = await users.countDocuments();
  const paymentsCount = await payments.countDocuments({ status: 'success' });
  const totalAgg = await payments.aggregate([
    { $match: { status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).toArray();
  const total = totalAgg[0]?.total || 0;

  const pendingW = await withdrawals.countDocuments({ status: 'pending' });

  await ctx.reply(
    `👑 АДМИН-ПАНЕЛЬ\n\n` +
    `👥 Юзеров: ${usersCount}\n` +
    `💳 Платежей: ${paymentsCount}\n` +
    `💰 Общая сумма: ${total}⭐\n` +
    `💸 Заявок на вывод: ${pendingW}\n\n` +
    `Команды:\n` +
    `/withdrawals — заявки\n` +
    `/approve ID — подтвердить\n` +
    `/reject ID — отклонить\n` +
    `/ban ID — забанить\n` +
    `/unban ID — разбанить\n` +
    `/broadcast текст — рассылка\n` +
    `/addpromo КОД ПРОЦЕНТ ЛИМИТ — создать промокод` +
    `/resetbonus ID|all — сбросить ежедневный бонус`
  );
});

bot.command('withdrawals', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const w = await getCollection('withdrawals');
  const list = await w.find({ status: 'pending' }).toArray();
  if (!list.length) return ctx.reply('Нет заявок');

  let text = '💸 Заявки:\n\n';
  list.forEach(x => {
    text += `ID: ${x._id}\n👤 ${x.first_name} (@${x.username || '—'})\n🆔 ${x.user_id}\n💰 ${x.amount}⭐\n\n`;
  });
  await ctx.reply(text);
});

bot.command('approve', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /approve ID');
  const w = await getCollection('withdrawals');
  await w.updateOne({ _id: new ObjectId(args[1]) }, { $set: { status: 'approved', approved_at: new Date() } });
  ctx.reply('✅ Подтверждено');
});

bot.command('reject', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /reject ID');
  const w = await getCollection('withdrawals');
  const users = await getCollection('users');
  const item = await w.findOne({ _id: new ObjectId(args[1]) });
  if (!item) return ctx.reply('Не найдено');
  await users.updateOne({ id: item.user_id }, { $inc: { balance: item.amount } });
  await w.updateOne({ _id: new ObjectId(args[1]) }, { $set: { status: 'rejected', rejected_at: new Date() } });
  ctx.reply('❌ Отклонено, баланс возвращён');
});

bot.command('ban', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /ban ID');
  const users = await getCollection('users');
  await users.updateOne({ id: parseInt(args[1]) }, { $set: { is_banned: true } });
  ctx.reply(`✅ Забанен: ${args[1]}`);
});

bot.command('unban', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /unban ID');
  const users = await getCollection('users');
  await users.updateOne({ id: parseInt(args[1]) }, { $set: { is_banned: false } });
  ctx.reply(`✅ Разбанен: ${args[1]}`);
});

// РАССЫЛКА
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const text = ctx.message.text.replace('/broadcast', '').trim();
  if (!text) return ctx.reply('Использование: /broadcast текст');

  const users = await getCollection('users');
  const list = await users.find({ is_banned: false }).toArray();

  await ctx.reply(`🚀 Рассылка на ${list.length} юзеров...`);
  let ok = 0, fail = 0;
  for (const u of list) {
    try {
      await ctx.telegram.sendMessage(u.id, text);
      ok++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { fail++; }
  }
  ctx.reply(`✅ Готово\nУспешно: ${ok}\nОшибок: ${fail}`);
});

// СОЗДАНИЕ ПРОМОКОДА
bot.command('addpromo', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 4) return ctx.reply('Использование: /addpromo КОД ПРОЦЕНТ ЛИМИТ');

  const code = args[1].toUpperCase();
  const percent = parseInt(args[2]);
  const limit = parseInt(args[3]);

  const promos = await getCollection('promocodes');
  await promos.insertOne({
    code,
    discount_percent: percent,
    max_uses: limit,
    used: 0,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    is_active: true
  });

  ctx.reply(`✅ Промокод ${code} создан (${percent}%, лимит ${limit})`);
});

// ==================== СБРОС БОНУСА (АДМИН) ====================
bot.command('resetbonus', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply(
      `Использование:\n` +
      `/resetbonus ID — сбросить бонус одному юзеру\n` +
      `/resetbonus all — сбросить бонус всем`
    );
  }

  const users = await getCollection('users');

  if (args[1] === 'all') {
    const result = await users.updateMany(
      {},
      { $unset: { last_daily_bonus: '', temp_dice: '' } }
    );
    return ctx.reply(`✅ Сброшено у ${result.modifiedCount} юзеров`);
  }

  const userId = parseInt(args[1]);
  const result = await users.updateOne(
    { id: userId },
    { $unset: { last_daily_bonus: '', temp_dice: '' } }
  );

  if (result.matchedCount === 0) {
    return ctx.reply(`❌ Юзер с ID ${userId} не найден`);
  }

  ctx.reply(`✅ Бонус сброшен для ${userId}`);
});

module.exports = bot;