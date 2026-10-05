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
const BONUS_SPIN_PRICE = 5;
const SURPRISE_CHANCE = 0.1;
const SURPRISE_MIN = 5;
const SURPRISE_MAX = 20;

// ==================== UI-СТИЛЬ ====================
const UI = {
  LINE: '— — —',
  bullet: (text) => `• ${text}`,
  title: (text) => `• ${text.toUpperCase()}`,
};

// ==================== ХЕЛПЕРЫ ====================
async function findVideoById(videosCollection, videoId) {
  let video = await videosCollection.findOne({ _id: videoId });
  if (video) return video;
  try {
    video = await videosCollection.findOne({ _id: new ObjectId(videoId) });
    if (video) return video;
  } catch (e) {}
  return null;
}

function formatTimeLeft(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}ч ${m}м`;
}

// ==================== MIDDLEWARE ====================
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat?.type !== 'private') return next();

  const userId = parseInt(ctx.from.id);

  if (!checkRateLimit(userId, 25)) {
    return ctx.reply('Слишком много запросов. Подожди минуту.');
  }

  if (isSuspiciousUser(ctx.from) && userId !== ADMIN_ID) {
    return ctx.reply(
      `• Доступ закрыт\n\n` +
      `Бот считает, что ваш аккаунт выглядит как бот. Если это ошибка — напишите ${SUPPORT}.`
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
          `• Новый реферал\n\n` +
          `По вашей ссылке пришёл новый пользователь. Как только он купит видео — вы получите ${REF_PERCENT}% от суммы.`);
      } catch (e) {}
    }
  } else {
    if (user.is_banned) {
      return ctx.reply(`• Доступ закрыт\n\nВы забанены. Если считаете, что произошла ошибка — напишите ${SUPPORT}.`);
    }
    if (referrerId && !user.referrer_id && !user.has_purchased) {
      await users.updateOne({ id: userId }, { $set: { referrer_id: referrerId } });
      await users.updateOne({ id: referrerId }, { $inc: { referral_count: 1 } });
      try {
        await ctx.telegram.sendMessage(referrerId,
          `• Новый реферал\n\n` +
          `По вашей ссылке пришёл новый пользователь. Как только он купит видео — вы получите ${REF_PERCENT}% от суммы.`);
      } catch (e) {}
    }
  }

  return next();
});

// ==================== ГЛАВНОЕ МЕНЮ ====================
bot.start(async (ctx) => {
  const text =
    `• EBLA TUTA\n\n` +
    `Добро пожаловать в бота с эксклюзивными видео. Здесь можно купить доступ к каталогу, получить бонус, пригласить друзей и заработать на рефералах.\n\n` +
    UI.LINE;

  await ctx.reply(text, {
    ...mainMenu(),
    parse_mode: 'HTML'
  });
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  try {
    await ctx.editMessageText(
      `• Главное меню\n\nВыберите раздел в меню ниже.\n\n${UI.LINE}`,
      mainMenu()
    );
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(`• Главное меню\n\nВыберите раздел в меню ниже.\n\n${UI.LINE}`, mainMenu());
  }
});

bot.action('support', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const text =
    `• Поддержка\n\n` +
    `По всем вопросам пишите: ${SUPPORT}\n\n` +
    UI.LINE;
  try {
    await ctx.editMessageText(text, backToMenu());
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(text, backToMenu());
  }
});

// ==================== КАК ЭТО РАБОТАЕТ ====================
bot.action('how_it_works', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});

  const text =
    `• Как это работает\n\n` +
    `Выбираете видео в каталоге, оплачиваете звёздами Telegram и сразу получаете ссылку на просмотр.\n\n` +
    `Также в боте есть ежедневный бонус, реферальная программа на ${REF_PERCENT}%, подписка на месяц, промокоды и вывод звёзд от ${MIN_WITHDRAW}.\n\n` +
    UI.LINE;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('Подробнее на сайте', 'https://ebla-tuta.vercel.app/about')],
    [Markup.button.callback('• В каталог', 'catalog')],
    [Markup.button.callback('« В меню', 'main_menu')]
  ]);

  try {
    await ctx.editMessageText(text, keyboard);
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(text, keyboard);
  }
});

// ==================== КАТАЛОГ (КАРТОЧКИ) ====================
bot.action('catalog', async (ctx) => {
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  if (!list.length) return ctx.answerCbQuery('Каталог пуст');

  await ctx.answerCbQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});
  await sendCatalog(ctx, list, 0);
});

async function sendCatalog(ctx, videos, index) {
  if (index < 0 || index >= videos.length) {
    return ctx.answerCbQuery('Конец каталога');
  }
  const v = videos[index];

  const caption =
    `• ${v.title}\n\n` +
    `Цена:  ${v.price} ⭐\n` +
    (v.description ? `\n${v.description}\n` : '') +
    `\n${index + 1} / ${videos.length}\n\n` +
    UI.LINE;

  const navButtons = [];
  if (index > 0) navButtons.push(Markup.button.callback('‹', `nav_${index - 1}`));
  navButtons.push(Markup.button.callback(`${index + 1} / ${videos.length}`, 'noop'));
  if (index < videos.length - 1) navButtons.push(Markup.button.callback('›', `nav_${index + 1}`));

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`Купить  ${v.price} ⭐`, `buy_${v.slug}`)],
    navButtons,
    [Markup.button.callback('Показать списком', 'catalog_list')],
    [Markup.button.callback('« В меню', 'main_menu')]
  ]);

  try {
    if (v.preview_url) {
      await ctx.replyWithPhoto(v.preview_url, { caption, ...keyboard });
    } else {
      await ctx.reply(caption, keyboard);
    }
  } catch (e) {
    await ctx.reply(caption, keyboard);
  }
}

bot.action(/nav_(\d+)/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  await ctx.answerCbQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});
  await sendCatalog(ctx, list, index);
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

// ==================== КАТАЛОГ (СПИСОК) ====================
bot.action('catalog_list', async (ctx) => {
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  if (!list.length) return ctx.answerCbQuery('Каталог пуст');

  await ctx.answerCbQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});
  await sendCatalogList(ctx, list);
});

async function sendCatalogList(ctx, videos) {
  let text = `• Каталог видео\n\nВсе доступные видео с ценами.\n\n`;
  videos.forEach((v, i) => {
    text += `${i + 1}.  ${v.title}\n`;
    text += `     ${v.price} ⭐\n`;
    if (v.description) text += `     ${v.description}\n`;
    text += `\n`;
  });
  text += UI.LINE;

  const buttons = videos.map(v => [
    Markup.button.callback(`${v.title}  ${v.price} ⭐`, `buy_${v.slug}`)
  ]);
  buttons.push([Markup.button.callback('Показать карточками', 'catalog')]);
  buttons.push([Markup.button.callback('« В меню', 'main_menu')]);

  await ctx.reply(text, {
    ...Markup.inlineKeyboard(buttons),
    disable_web_page_preview: true
  });
}

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
    const text =
      `• Подписка активна\n\n` +
      `У вас осталось ${daysLeft} дн. Подписка действует до ${active.end_date.toLocaleDateString('ru-RU')}.\n\n` +
      UI.LINE;
    return ctx.editMessageText(text, backToMenu());
  }

  const text =
    `• Подписка на месяц\n\n` +
    `Доступ ко всем видео каталога. Стоимость ${SUB_PRICE} ⭐ за ${SUB_DAYS} дней.\n\n` +
    UI.LINE;

  await ctx.editMessageText(text, Markup.inlineKeyboard([
    [Markup.button.callback(`Купить  ${SUB_PRICE} ⭐`, 'buy_subscription')],
    [Markup.button.callback('« Назад', 'main_menu')]
  ]));
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
    .find({ user_id: userId, status: 'success' })
    .sort({ created_at: -1 })
    .toArray();

  const videoSlugs = [...new Set(userPayments.map(p => p.video_slug).filter(Boolean))];

  if (!videoSlugs.length) {
    return ctx.editMessageText(
      `• Мои видео\n\nУ вас пока нет купленных видео. Загляните в каталог — там есть что выбрать.\n\n${UI.LINE}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('• В каталог', 'catalog')],
        [Markup.button.callback('« Назад', 'main_menu')]
      ])
    );
  }

  const purchased = await videos.find({ slug: { $in: videoSlugs } }).toArray();

  let text = `• Мои видео\n\nЗдесь собраны все купленные вами видео (${purchased.length}).\n\n`;
  purchased.forEach((v, i) => {
    text += `${i + 1}.  ${v.title}\n`;
    text += `     ${v.video_url}\n\n`;
  });
  text += UI.LINE;

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
    `• Профиль\n\n` +
    `Ваш ID: ${user.id}. Вы пригласили ${user.referral_count || 0} друзей.\n\n` +
    `Баланс: ${user.balance || 0} ⭐. Заработано: ${user.referral_earnings || 0} ⭐.\n\n` +
    `• Реферальная ссылка\n${refLink}\n\n` +
    `За покупку друга — ${REF_PERCENT}%. Вывод — от ${MIN_WITHDRAW} ⭐.\n\n` +
    UI.LINE;

  const buttons = [];
  if ((user.balance || 0) >= MIN_WITHDRAW) {
    buttons.push([Markup.button.callback('• Вывести', 'withdraw')]);
  }
  buttons.push([Markup.button.callback('« Назад', 'main_menu')]);

  try {
    await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(text, Markup.inlineKeyboard(buttons));
  }
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
    `• Заявка создана\n\n` +
    `Сумма вывода ${amount} ⭐. Админ свяжется с вами в течение 24 часов.\n\n` +
    UI.LINE,
    backToMenu()
  );

  try {
    await ctx.telegram.sendMessage(ADMIN_ID,
      `• Новая заявка на вывод\n\n` +
      `Имя: ${user.first_name}. Юзер: @${user.username || '—'}. ID: ${userId}. Сумма: ${amount} ⭐.\n\n` +
      `Написать: tg://user?id=${userId}`);
  } catch (e) {}
});

// ==================== ЕЖЕДНЕВНЫЙ БОНУС ====================
bot.action('daily_bonus', async (ctx) => {
  const users = await getCollection('users');
  const userId = parseInt(ctx.from.id);
  const user = await users.findOne({ id: userId });

  const now = Date.now();
  let timeLeft = 0;
  let canPlay = true;

  if (user.last_daily_bonus) {
    const diff = now - new Date(user.last_daily_bonus).getTime();
    if (diff < BONUS_COOLDOWN) {
      timeLeft = BONUS_COOLDOWN - diff;
      canPlay = false;
    }
  }

  if (canPlay) {
    const text =
      `• Ежедневный бонус\n\n` +
      `Бросаем кость (1-6), затем рулетка (×1 — ×3). Можно получить от 1 до 18 ⭐.\n\n` +
      `Подробнее: https://ebla-tuta.vercel.app/bonus\n\n` +
      UI.LINE;

    return ctx.editMessageText(text, Markup.inlineKeyboard([
      [Markup.button.callback('Бросить кость', 'roll_dice')],
      [Markup.button.callback('« В меню', 'main_menu')]
    ]));
  }

  const text =
    `• Ежедневный бонус\n\n` +
    `Вы уже играли сегодня. Следующий бесплатный прокрут через ${formatTimeLeft(timeLeft)}.\n\n` +
    `Можно получить от 1 до 18 ⭐. Подробнее: https://ebla-tuta.vercel.app/bonus\n\n` +
    UI.LINE;

  await ctx.editMessageText(text, Markup.inlineKeyboard([
    [Markup.button.callback(`Купить прокрут за ${BONUS_SPIN_PRICE} ⭐`, 'buy_bonus_spin')],
    [Markup.button.callback('« В меню', 'main_menu')]
  ]));
});

// ==================== ПОКУПКА ПРОКРУТА ====================
bot.action('buy_bonus_spin', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.replyWithInvoice({
    title: 'Прокрут бонуса',
    description: 'Дополнительный прокрут ежедневного бонуса',
    payload: 'bonus_spin',
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Прокрут', amount: BONUS_SPIN_PRICE }]
  });
});

bot.action('roll_dice', async (ctx) => {
  const diceMsg = await ctx.replyWithDice();
  const diceValue = diceMsg.dice.value;

  await new Promise(r => setTimeout(r, 3500));

  const users = await getCollection('users');
  await users.updateOne(
    { id: parseInt(ctx.from.id) },
    { $set: { temp_dice: diceValue } }
  );

  await ctx.reply(
    `• Кость\n\nВыпало число ${diceValue}. Теперь рулетка (×1 — ×3).\n\n${UI.LINE}`,
    Markup.inlineKeyboard([[Markup.button.callback('Крутить', 'roll_slot')]])
  );
});

bot.action('roll_slot', async (ctx) => {
  const slotMsg = await ctx.replyWithDice({ emoji: '🎰' });
  const slotValue = slotMsg.dice.value;

  await new Promise(r => setTimeout(r, 3500));

  const multipliers = { 1: 1, 22: 1.5, 43: 2, 64: 3 };
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
    `• Твой бонус\n\n` +
    `Кость ${diceValue}, рулетка ×${multiplier}. Итого +${bonus} ⭐ на баланс.\n\n` +
    `Следующий бесплатный прокрут через 24 часа или купите за ${BONUS_SPIN_PRICE} ⭐.\n\n` +
    UI.LINE,
    backToMenu()
  );
});

// ==================== ПРОМОКОДЫ ====================
bot.command('promo', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });

  if (user.promo_code) {
    return ctx.reply(
      `• Промокод уже активирован\n\n` +
      `Код ${user.promo_code} даёт скидку ${user.promo_discount}%. Он применится при следующей покупке.\n\n` +
      UI.LINE,
      mainMenu()
    );
  }

  await ctx.reply(
    `• Активация промокода\n\nОтправьте код следующим сообщением.\n\n${UI.LINE}`,
    Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'main_menu')]])
  );

  const handler = async (ctx2) => {
    if (ctx2.from.id !== ctx.from.id) return;
    bot.off('text', handler);

    const code = ctx2.message.text.trim().toUpperCase();
    const promos = await getCollection('promocodes');
    const promo = await promos.findOne({ code, is_active: true });

    if (!promo) {
      return ctx2.reply(
        `• Промокод не найден\n\nКод "${code}" не существует или неактивен.\n\n${UI.LINE}`,
        mainMenu()
      );
    }
    if (promo.used >= promo.max_uses) {
      return ctx2.reply(
        `• Промокод исчерпан\n\nКод "${code}" использован максимальное число раз (${promo.max_uses}).\n\n${UI.LINE}`,
        mainMenu()
      );
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return ctx2.reply(
        `• Промокод истёк\n\nКод "${code}" действовал до ${new Date(promo.expires_at).toLocaleDateString('ru-RU')}.\n\n${UI.LINE}`,
        mainMenu()
      );
    }

    await users.updateOne(
      { id: parseInt(ctx2.from.id) },
      { $set: { promo_code: promo.code, promo_discount: promo.discount_percent } }
    );

    const left = promo.max_uses - promo.used - 1;
    await ctx2.reply(
      `• Промокод активирован\n\n` +
      `Код ${promo.code} даёт скидку ${promo.discount_percent}%. Осталось активаций: ${left}. Применится при следующей покупке.\n\n` +
      UI.LINE,
      mainMenu()
    );
  };

  bot.on('text', handler);
});

// ==================== ПОКУПКА ====================
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
      `• Подписка активна\n\nУ вас есть активная подписка. Вот ссылка на видео: ${video.video_url}\n\n${UI.LINE}`,
      backToMenu()
    );
  }

  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });

  const discount = user.promo_discount || 0;
  let finalPrice = applyDiscount(video.price, discount);

  const balance = user.balance || 0;
  let starsToPay = finalPrice;
  let starsFromBalance = 0;

  if (balance > 0) {
    if (balance >= finalPrice) {
      starsFromBalance = finalPrice;
      starsToPay = 0;
    } else {
      starsFromBalance = balance;
      starsToPay = finalPrice - balance;
    }
  }

  // ===== ПОЛНАЯ ОПЛАТА С БАЛАНСА =====
  if (starsToPay === 0) {
    await users.updateOne(
      { id: user.id },
      { $inc: { balance: -starsFromBalance } }
    );

    const payments = await getCollection('payments');
    await payments.insertOne({
      user_id: user.id,
      video_slug: video.slug,
      video_id: video._id.toString(),
      type: 'video',
      amount: 0,
      paid_from_balance: starsFromBalance,
      telegram_payment_id: null,
      status: 'success',
      created_at: new Date()
    });

    await users.updateOne(
      { id: user.id },
      { $set: { has_purchased: true, promo_code: null, promo_discount: 0 } }
    );

    if (user.promo_code) {
      const promos = await getCollection('promocodes');
      await promos.updateOne({ code: user.promo_code }, { $inc: { used: 1 } });
    }

    if (user.referrer_id) {
      const bonus = Math.floor(finalPrice * REF_PERCENT / 100);
      await users.updateOne(
        { id: user.referrer_id },
        { $inc: { balance: bonus, referral_earnings: bonus } }
      );
      try {
        await ctx.telegram.sendMessage(user.referrer_id,
          `• Доход с реферала\n\n` +
          `Сумма ${finalPrice} ⭐. Ваш доход +${bonus} ⭐.\n\n${UI.LINE}`);
      } catch (e) {}
    }

    if (Math.random() < SURPRISE_CHANCE) {
      const surprise = Math.floor(Math.random() * (SURPRISE_MAX - SURPRISE_MIN + 1)) + SURPRISE_MIN;
      await users.updateOne({ id: user.id }, { $inc: { balance: surprise } });
      await ctx.reply(
        `• Сюрприз\n\nТебе повезло! Бонус +${surprise} ⭐.\n\n${UI.LINE}`
      );
    }

    await ctx.reply(
      `• Оплата прошла\n\n` +
      `Списано с баланса ${starsFromBalance} ⭐. Вот ссылка на видео: ${video.video_url}\n\n` +
      `Не передавайте никому.\n\n` +
      UI.LINE,
      mainMenu()
    );

    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `• Оплата балансом\n\n` +
        `Имя ${ctx.from.first_name}. Юзер @${ctx.from.username || '—'}. ID ${user.id}. Видео "${video.title}". Сумма ${starsFromBalance} ⭐.`);
    } catch (e) {}
    return;
  }

  // ===== ИНВОЙС =====
  const pending = await getCollection('pending_payments');
  await pending.insertOne({
    user_id: user.id,
    video_slug: video.slug,
    video_title: video.title,
    price: finalPrice,
    stars_to_pay: starsToPay,
    stars_from_balance: starsFromBalance,
    created_at: new Date(),
    reminded: false
  });

  let infoText = `• Оплата\n\n`;
  if (starsFromBalance > 0) {
    infoText += `С баланса спишется ${starsFromBalance} ⭐, звёздами нужно доплатить ${starsToPay} ⭐. Открываю окно оплаты.\n\n`;
  } else {
    infoText += `Открываю окно оплаты.\n\n`;
  }
  infoText += UI.LINE;

  await ctx.reply(infoText);

  await ctx.replyWithInvoice({
    title: video.title + (discount ? ` (-${discount}%)` : ''),
    description: `Доступ к видео "${video.title}"`,
    payload: `video_${video._id.toString()}`,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: video.title, amount: starsToPay }]
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
      `• Подписка оформлена\n\n` +
      `Действует до ${endDate.toLocaleDateString('ru-RU')}. Все видео каталога доступны бесплатно.\n\n` +
      UI.LINE,
      mainMenu()
    );

    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `• Подписка\n\n` +
        `Имя ${ctx.from.first_name}. Юзер @${ctx.from.username || '—'}. ID ${userId}. Сумма ${amount} ⭐.`);
    } catch (e) {}
    return;
  }

  // ===== ПОКУПКА ПРОКРУТА БОНУСА =====
  if (payload === 'bonus_spin') {
    await users.updateOne(
      { id: userId },
      { $unset: { last_daily_bonus: '', temp_dice: '' } }
    );

    await payments.insertOne({
      user_id: userId,
      type: 'bonus_spin',
      amount,
      telegram_payment_id: payment.telegram_payment_charge_id,
      status: 'success',
      created_at: new Date()
    });

    await ctx.reply(
      `• Прокрут куплен\n\n` +
      `Оплачено ${amount} ⭐. Открывайте раздел «Бонус» и играйте.\n\n` +
      UI.LINE,
      Markup.inlineKeyboard([
        [Markup.button.callback('• Бонус', 'daily_bonus')],
        [Markup.button.callback('« В меню', 'main_menu')]
      ])
    );

    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `• Покупка прокрута\n\n` +
        `Имя ${ctx.from.first_name}. Юзер @${ctx.from.username || '—'}. ID ${userId}. Сумма ${amount} ⭐.`);
    } catch (e) {}
    return;
  }

  // ===== ОДНО ВИДЕО =====
  if (payload.startsWith('video_')) {
    const videoId = payload.replace('video_', '');
    const video = await findVideoById(videos, videoId);
    if (!video) return ctx.reply('Видео не найдено');

    const pendingRecord = await pending.findOne({
      user_id: userId,
      video_slug: video.slug
    });

    const starsFromBalance = pendingRecord?.stars_from_balance || 0;

    if (starsFromBalance > 0) {
      await users.updateOne(
        { id: userId },
        { $inc: { balance: -starsFromBalance } }
      );
    }

    await payments.insertOne({
      user_id: userId,
      video_slug: video.slug,
      video_id: video._id.toString(),
      type: 'video',
      amount: amount,
      paid_from_balance: starsFromBalance,
      telegram_payment_id: payment.telegram_payment_charge_id,
      status: 'success',
      created_at: new Date()
    });

    let successText = `• Оплата прошла\n\n`;
    successText += `Оплачено звёздами ${amount} ⭐.`;
    if (starsFromBalance > 0) {
      successText += ` Списано с баланса ${starsFromBalance} ⭐.`;
    }
    successText += `\n\nСсылка на видео: ${video.video_url}\n\nНе передавайте никому.\n\n`;
    successText += UI.LINE;

    await ctx.reply(successText, mainMenu());

    await pending.deleteMany({ user_id: userId, video_slug: video.slug });

    await users.updateOne(
      { id: userId },
      { $set: { has_purchased: true, promo_code: null, promo_discount: 0 } }
    );

    if (user.promo_code) {
      await promos.updateOne({ code: user.promo_code }, { $inc: { used: 1 } });
    }

    const fullPrice = amount + starsFromBalance;
    if (user.referrer_id) {
      const bonus = Math.floor(fullPrice * REF_PERCENT / 100);
      await users.updateOne(
        { id: user.referrer_id },
        { $inc: { balance: bonus, referral_earnings: bonus } }
      );
      try {
        await ctx.telegram.sendMessage(user.referrer_id,
          `• Доход с реферала\n\n` +
          `Сумма ${fullPrice} ⭐. Ваш доход +${bonus} ⭐.\n\n${UI.LINE}`);
      } catch (e) {}
    }

    if (Math.random() < SURPRISE_CHANCE) {
      const surprise = Math.floor(Math.random() * (SURPRISE_MAX - SURPRISE_MIN + 1)) + SURPRISE_MIN;
      await users.updateOne({ id: userId }, { $inc: { balance: surprise } });
      await ctx.reply(
        `• Сюрприз\n\nТебе повезло! Бонус +${surprise} ⭐.\n\n${UI.LINE}`
      );
    }

    try {
      await ctx.telegram.sendMessage(ADMIN_ID,
        `• Новая оплата\n\n` +
        `Имя ${ctx.from.first_name}. Юзер @${ctx.from.username || '—'}. ID ${userId}. Видео "${video.title}". Баланс ${starsFromBalance} ⭐. Звёзды ${amount} ⭐.`);
    } catch (e) {}
  }
});

// ==================== АДМИН ====================
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
    `• Админ-панель\n\n` +
    `Юзеров ${usersCount}, платежей ${paymentsCount}, общая сумма ${total} ⭐, заявок на вывод ${pendingW}.\n\n` +
    `• Команды\n` +
    `/withdrawals — заявки\n` +
    `/approve ID — подтвердить\n` +
    `/reject ID — отклонить\n` +
    `/ban ID — забанить\n` +
    `/unban ID — разбанить\n` +
    `/broadcast текст — рассылка\n` +
    `/addpromo КОД ПРОЦЕНТ ЛИМИТ — промокод\n` +
    `/resetbonus ID|all — сброс бонуса\n\n` +
    UI.LINE
  );
});

bot.command('withdrawals', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const w = await getCollection('withdrawals');
  const list = await w.find({ status: 'pending' }).toArray();
  if (!list.length) return ctx.reply('Нет заявок');

  let text = `• Заявки на вывод\n\n`;
  list.forEach(x => {
    text += `ID ${x._id}. ${x.first_name} (@${x.username || '—'}). Юзер ${x.user_id}. Сумма ${x.amount} ⭐.\n\n`;
  });
  text += UI.LINE;
  await ctx.reply(text);
});

bot.command('approve', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /approve ID');
  const w = await getCollection('withdrawals');
  await w.updateOne({ _id: new ObjectId(args[1]) }, { $set: { status: 'approved', approved_at: new Date() } });
  ctx.reply('• Подтверждено');
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
  ctx.reply('• Отклонено. Баланс возвращён.');
});

bot.command('ban', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /ban ID');
  const users = await getCollection('users');
  await users.updateOne({ id: parseInt(args[1]) }, { $set: { is_banned: true } });
  ctx.reply(`• Забанен: ${args[1]}`);
});

bot.command('unban', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /unban ID');
  const users = await getCollection('users');
  await users.updateOne({ id: parseInt(args[1]) }, { $set: { is_banned: false } });
  ctx.reply(`• Разбанен: ${args[1]}`);
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const text = ctx.message.text.replace('/broadcast', '').trim();
  if (!text) return ctx.reply('Использование: /broadcast текст');

  const users = await getCollection('users');
  const list = await users.find({ is_banned: false }).toArray();

  await ctx.reply(`• Рассылка\n\nВсего ${list.length} юзеров.\n\n${UI.LINE}`);
  let ok = 0, fail = 0;
  for (const u of list) {
    try {
      await ctx.telegram.sendMessage(u.id, text);
      ok++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { fail++; }
  }
  ctx.reply(`• Готово\n\nУспешно ${ok}, ошибок ${fail}.\n\n${UI.LINE}`);
});

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

  ctx.reply(
    `• Промокод создан\n\n` +
    `Код ${code} даёт скидку ${percent}%. Лимит активаций ${limit}.\n\n` +
    UI.LINE
  );
});

bot.command('resetbonus', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply(
      `Использование:\n` +
      `/resetbonus ID — сброс одному\n` +
      `/resetbonus all — сброс всем`
    );
  }

  const users = await getCollection('users');

  if (args[1] === 'all') {
    const result = await users.updateMany(
      {},
      { $unset: { last_daily_bonus: '', temp_dice: '' } }
    );
    return ctx.reply(`• Сброшено у ${result.modifiedCount} юзеров`);
  }

  const userId = parseInt(args[1]);
  const result = await users.updateOne(
    { id: userId },
    { $unset: { last_daily_bonus: '', temp_dice: '' } }
  );

  if (result.matchedCount === 0) {
    return ctx.reply(`• Юзер ${userId} не найден`);
  }

  ctx.reply(`• Бонус сброшен у ${userId}`);
});

module.exports = bot;