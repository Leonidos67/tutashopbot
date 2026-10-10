const { Telegraf, Markup } = require('telegraf');
const { getCollection } = require('./db');
const { mainMenu, backToMenu } = require('./keyboards');
const { checkRateLimit, isSuspiciousUser, applyDiscount } = require('./helpers');
const { t, getLang, formatTimeLeft } = require('./i18n');
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

// ==================== MIDDLEWARE ====================
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat?.type !== 'private') return next();

  const userId = parseInt(ctx.from.id);

  if (!checkRateLimit(userId, 25)) {
    return ctx.reply(t('ru', 'err_too_many'));
  }

  if (isSuspiciousUser(ctx.from) && userId !== ADMIN_ID) {
    return ctx.reply(t('ru', 'err_blocked', { support: SUPPORT }));
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
      lang: 'ru',
      created_at: new Date()
    });

    if (referrerId) {
      await users.updateOne({ id: referrerId }, { $inc: { referral_count: 1 } });
      try {
        const refUser = await users.findOne({ id: referrerId });
        await ctx.telegram.sendMessage(referrerId,
          t(getLang(refUser), 'referral_new', { percent: REF_PERCENT }));
      } catch (e) {}
    }
  } else {
    if (user.is_banned) {
      return ctx.reply(t(getLang(user), 'err_banned', { support: SUPPORT }));
    }
    if (referrerId && !user.referrer_id && !user.has_purchased) {
      await users.updateOne({ id: userId }, { $set: { referrer_id: referrerId } });
      await users.updateOne({ id: referrerId }, { $inc: { referral_count: 1 } });
      try {
        const refUser = await users.findOne({ id: referrerId });
        await ctx.telegram.sendMessage(referrerId,
          t(getLang(refUser), 'referral_new', { percent: REF_PERCENT }));
      } catch (e) {}
    }
  }

  return next();
});

// ==================== СМЕНА ЯЗЫКА ====================
bot.action('change_lang', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🇷🇺 Русский', 'set_lang_ru')],
    [Markup.button.callback('🇬🇧 English', 'set_lang_en')],
    [Markup.button.callback(t(lang, 'btn_back_short'), 'main_menu')]
  ]);

  const text = `${t(lang, 'lang_title')}\n\n${t(lang, 'lang_text')}`;

  try {
    await ctx.editMessageText(text, keyboard);
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(text, keyboard);
  }
});

bot.action(/set_lang_(ru|en)/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const newLang = ctx.match[1];
  const users = await getCollection('users');
  await users.updateOne(
    { id: parseInt(ctx.from.id) },
    { $set: { lang: newLang } }
  );

  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  await ctx.reply(t(newLang, 'lang_set'));
  await ctx.reply(t(newLang, 'main_menu'), mainMenu(user));
});

// ==================== ГЛАВНОЕ МЕНЮ ====================
bot.start(async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  await ctx.reply(t(lang, 'welcome'), {
    ...mainMenu(user),
    parse_mode: 'HTML'
  });
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  try {
    await ctx.editMessageText(t(lang, 'main_menu'), mainMenu(user));
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(t(lang, 'main_menu'), mainMenu(user));
  }
});

bot.action('support', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  const text = `${t(lang, 'support_title')}\n\n${t(lang, 'support_text', { user: SUPPORT })}`;
  try {
    await ctx.editMessageText(text, backToMenu(user));
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(text, backToMenu(user));
  }
});

// ==================== КАК ЭТО РАБОТАЕТ ====================
bot.action('how_it_works', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  const text = `${t(lang, 'how_title')}\n\n${t(lang, 'how_text', { percent: REF_PERCENT, min: MIN_WITHDRAW })}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url(t(lang, 'how_more'), 'https://ebla-tuta.vercel.app/about')],
    [Markup.button.callback(t(lang, 'how_go'), 'catalog')],
    [Markup.button.callback(t(lang, 'btn_back'), 'main_menu')]
  ]);

  try {
    await ctx.editMessageText(text, keyboard);
  } catch (e) {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(text, keyboard);
  }
});

// ==================== КАТАЛОГ ====================
bot.action('catalog', async (ctx) => {
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  if (!list.length) return ctx.answerCbQuery(t(lang, 'catalog_empty'));

  await ctx.answerCbQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});
  await sendCatalog(ctx, list, 0, lang);
});

async function sendCatalog(ctx, videos, index, lang) {
  if (index < 0 || index >= videos.length) {
    return ctx.answerCbQuery(t(lang, 'err_end_catalog'));
  }
  const v = videos[index];

  const caption =
    `• ${v.title}\n\n` +
    (v.description ? `\n${v.description}\n` : '');

  const navButtons = [];
  if (index > 0) navButtons.push(Markup.button.callback('‹', `nav_${index - 1}`));
  navButtons.push(Markup.button.callback(`${index + 1} / ${videos.length}`, 'noop'));
  if (index < videos.length - 1) navButtons.push(Markup.button.callback('›', `nav_${index + 1}`));

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`${t(lang, 'catalog_buy')} ${v.price} ⭐`, `buy_${v.slug}`)],
    navButtons,
    [Markup.button.callback(t(lang, 'catalog_list'), 'catalog_list')],
    [Markup.button.callback(t(lang, 'btn_back'), 'main_menu')] 
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
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  await ctx.answerCbQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});
  await sendCatalog(ctx, list, index, lang);
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

// ==================== КАТАЛОГ (СПИСОК) ====================
bot.action('catalog_list', async (ctx) => {
  const videos = await getCollection('videos');
  const list = await videos.find({ is_active: true }).toArray();
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  if (!list.length) return ctx.answerCbQuery(t(lang, 'catalog_empty'));

  await ctx.answerCbQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});
  await sendCatalogList(ctx, list, lang);
});

async function sendCatalogList(ctx, videos, lang) {
  let text = `${t(lang, 'catalog_title')}\n\n${t(lang, 'catalog_desc')}\n\n`;
  videos.forEach((v, i) => {
    text += `${i + 1}.  ${v.title}\n`;
    text += `     ${v.price} ⭐\n`;
    if (v.description) text += `     ${v.description}\n`;
    text += `\n`;
  });

  const buttons = videos.map(v => [
    Markup.button.callback(`${v.title}  ${v.price} ⭐`, `buy_${v.slug}`)
  ]);
  buttons.push([Markup.button.callback(t(lang, 'catalog_cards'), 'catalog')]);
  buttons.push([Markup.button.callback(t(lang, 'btn_back'), 'main_menu')]);

  await ctx.reply(text, {
    ...Markup.inlineKeyboard(buttons),
    disable_web_page_preview: true
  });
}

// ==================== ПОДПИСКА ====================
bot.action('subscription', async (ctx) => {
  const subs = await getCollection('subscriptions');
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);
  const userId = parseInt(ctx.from.id);

  const active = await subs.findOne({
    user_id: userId,
    status: 'active',
    end_date: { $gt: new Date() }
  });

  if (active) {
    const daysLeft = Math.ceil((active.end_date - new Date()) / (24 * 60 * 60 * 1000));
    const text = `${t(lang, 'sub_active')}\n\n${t(lang, 'sub_active_text', { days: daysLeft, date: active.end_date.toLocaleDateString('ru-RU') })}`;
    return ctx.editMessageText(text, backToMenu(user));
  }

  const text = `${t(lang, 'sub_title')}\n\n${t(lang, 'sub_desc', { price: SUB_PRICE, days: SUB_DAYS })}`;

  await ctx.editMessageText(text, Markup.inlineKeyboard([
    [Markup.button.callback(`${t(lang, 'sub_buy')} ${SUB_PRICE} ⭐`, 'buy_subscription')],
    [Markup.button.callback(t(lang, 'btn_back_short'), 'main_menu')]
  ]));
});

bot.action('buy_subscription', async (ctx) => {
  await ctx.replyWithInvoice({
    title: 'Subscription',
    description: `Access to all videos for ${SUB_DAYS} days`,
    payload: 'subscription',
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Subscription', amount: SUB_PRICE }]
  });
});

// ==================== МОИ ВИДЕО ====================
bot.action('my_videos', async (ctx) => {
  const payments = await getCollection('payments');
  const videos = await getCollection('videos');
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);
  const userId = parseInt(ctx.from.id);

  const userPayments = await payments
    .find({ user_id: userId, status: 'success' })
    .sort({ created_at: -1 })
    .toArray();

  const videoSlugs = [...new Set(userPayments.map(p => p.video_slug).filter(Boolean))];

  if (!videoSlugs.length) {
    return ctx.editMessageText(
      `${t(lang, 'myvideos_title')}\n\n${t(lang, 'myvideos_empty')}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'myvideos_go'), 'catalog')],
        [Markup.button.callback(t(lang, 'btn_back_short'), 'main_menu')]
      ])
    );
  }

  const purchased = await videos.find({ slug: { $in: videoSlugs } }).toArray();

  let text = `${t(lang, 'myvideos_title')}\n\n${t(lang, 'myvideos_desc', { count: purchased.length })}\n\n`;
  purchased.forEach((v, i) => {
    text += `${i + 1}.  ${v.title}\n`;
    text += `     ${v.video_url}\n\n`;
  });

  await ctx.editMessageText(text, {
    ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn_back_short'), 'main_menu')]]),
    disable_web_page_preview: true
  });
});

// ==================== ПРОФИЛЬ ====================
bot.action('profile', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);
  const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;

  const text =
    `${t(lang, 'profile_title')}\n\n` +
    `${t(lang, 'profile_id')}: ${user.id}. ${t(lang, 'profile_friends')}: ${user.referral_count || 0}.\n\n` +
    `${t(lang, 'profile_balance')}: ${user.balance || 0} ⭐. ${t(lang, 'profile_earned')}: ${user.referral_earnings || 0} ⭐.\n\n` +
    `${t(lang, 'profile_ref_link')}\n${refLink}\n\n` +
    t(lang, 'profile_ref_info', { percent: REF_PERCENT, min: MIN_WITHDRAW });

  const buttons = [];
  if ((user.balance || 0) >= MIN_WITHDRAW) {
    buttons.push([Markup.button.callback(t(lang, 'profile_withdraw'), 'withdraw')]);
  }
  buttons.push([Markup.button.callback(t(lang, 'btn_back_short'), 'main_menu')]);

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
  const lang = getLang(user);

  if (!user || user.balance < MIN_WITHDRAW) {
    return ctx.answerCbQuery(t(lang, 'withdraw_no_money'));
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
    `${t(lang, 'withdraw_created')}\n\n${t(lang, 'withdraw_created_text', { amount })}`,
    backToMenu(user)
  );

  try {
    const admin = await users.findOne({ id: ADMIN_ID });
    await ctx.telegram.sendMessage(ADMIN_ID,
      t(getLang(admin), 'admin_withdraw', {
        name: user.first_name,
        username: user.username || '—',
        id: userId,
        amount
      }));
  } catch (e) {}
});

// ==================== БОНУС ====================
bot.action('daily_bonus', async (ctx) => {
  const users = await getCollection('users');
  const userId = parseInt(ctx.from.id);
  const user = await users.findOne({ id: userId });
  const lang = getLang(user);

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
    const text = `${t(lang, 'bonus_title')}\n\n${t(lang, 'bonus_desc')}\n\n${t(lang, 'bonus_more')}: https://ebla-tuta.vercel.app/bonus`;

    return ctx.editMessageText(text, Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'bonus_play'), 'roll_dice')],
      [Markup.button.callback(t(lang, 'btn_back'), 'main_menu')]
    ]));
  }

  const text =
    `${t(lang, 'bonus_title')}\n\n` +
    `${t(lang, 'bonus_already', { time: formatTimeLeft(timeLeft, lang) })}\n\n` +
    `${t(lang, 'bonus_desc')}\n\n` +
    `${t(lang, 'bonus_more')}: https://ebla-tuta.vercel.app/bonus`;

  await ctx.editMessageText(text, Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'bonus_buy_spin', { price: BONUS_SPIN_PRICE }), 'buy_bonus_spin')],
    [Markup.button.callback(t(lang, 'btn_back'), 'main_menu')]
  ]));
});

bot.action('buy_bonus_spin', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.replyWithInvoice({
    title: 'Bonus spin',
    description: 'Extra spin for daily bonus',
    payload: 'bonus_spin',
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Spin', amount: BONUS_SPIN_PRICE }]
  });
});

bot.action('roll_dice', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  const diceMsg = await ctx.replyWithDice();
  const diceValue = diceMsg.dice.value;

  await new Promise(r => setTimeout(r, 3500));

  await users.updateOne(
    { id: parseInt(ctx.from.id) },
    { $set: { temp_dice: diceValue } }
  );

  await ctx.reply(
    `${t(lang, 'bonus_roll_dice')}\n\n${t(lang, 'bonus_dice_result', { value: diceValue })}`,
    Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'bonus_roll_slot'), 'roll_slot')]])
  );
});

bot.action('roll_slot', async (ctx) => {
  const users = await getCollection('users');
  const userId = parseInt(ctx.from.id);
  const user = await users.findOne({ id: userId });
  const lang = getLang(user);

  const slotMsg = await ctx.replyWithDice({ emoji: '🎰' });
  const slotValue = slotMsg.dice.value;

  await new Promise(r => setTimeout(r, 3500));

  const multipliers = { 1: 1, 22: 1.5, 43: 2, 64: 3 };
  const multiplier = multipliers[slotValue] || 1;

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
    `${t(lang, 'bonus_result')}\n\n${t(lang, 'bonus_result_text', { dice: diceValue, mult: multiplier, bonus })}\n\n${t(lang, 'bonus_next', { price: BONUS_SPIN_PRICE })}`,
    backToMenu(user)
  );
});

// ==================== ПРОМОКОДЫ ====================
bot.command('promo', async (ctx) => {
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  if (user.promo_code) {
    return ctx.reply(
      `${t(lang, 'promo_already')}\n\n${t(lang, 'promo_already_text', { code: user.promo_code, discount: user.promo_discount })}`,
      mainMenu(user)
    );
  }

  await ctx.reply(
    `${t(lang, 'promo_enter')}\n\n${t(lang, 'promo_enter_text')}`,
    Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'promo_cancel'), 'main_menu')]])
  );

  const handler = async (ctx2) => {
    if (ctx2.from.id !== ctx.from.id) return;
    bot.off('text', handler);

    const code = ctx2.message.text.trim().toUpperCase();
    const promos = await getCollection('promocodes');
    const promo = await promos.findOne({ code, is_active: true });

    if (!promo) {
      return ctx2.reply(
        `${t(lang, 'promo_notfound')}\n\n${t(lang, 'promo_notfound_text', { code })}`,
        mainMenu(user)
      );
    }
    if (promo.used >= promo.max_uses) {
      return ctx2.reply(
        `${t(lang, 'promo_used')}\n\n${t(lang, 'promo_used_text', { code, max: promo.max_uses })}`,
        mainMenu(user)
      );
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return ctx2.reply(
        `${t(lang, 'promo_expired')}\n\n${t(lang, 'promo_expired_text', { code, date: new Date(promo.expires_at).toLocaleDateString('ru-RU') })}`,
        mainMenu(user)
      );
    }

    await users.updateOne(
      { id: parseInt(ctx2.from.id) },
      { $set: { promo_code: promo.code, promo_discount: promo.discount_percent } }
    );

    const left = promo.max_uses - promo.used - 1;
    await ctx2.reply(
      `${t(lang, 'promo_activated')}\n\n${t(lang, 'promo_activated_text', { code: promo.code, discount: promo.discount_percent, left })}`,
      mainMenu(user)
    );
  };

  bot.on('text', handler);
});

// ==================== ПОКУПКА ====================
bot.action(/buy_(.+)/, async (ctx) => {
  const slug = ctx.match[1];
  const videos = await getCollection('videos');
  const video = await videos.findOne({ slug });
  const users = await getCollection('users');
  const user = await users.findOne({ id: parseInt(ctx.from.id) });
  const lang = getLang(user);

  if (!video) return ctx.answerCbQuery(t(lang, 'err_video_not_found'));

  const subs = await getCollection('subscriptions');
  const active = await subs.findOne({
    user_id: parseInt(ctx.from.id),
    status: 'active',
    end_date: { $gt: new Date() }
  });

  if (active) {
    return ctx.reply(
      t(lang, 'err_subscription_active', { url: video.video_url }),
      backToMenu(user)
    );
  }

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
        const refUser = await users.findOne({ id: user.referrer_id });
        await ctx.telegram.sendMessage(user.referrer_id,
          t(getLang(refUser), 'referral_income', { sum: finalPrice, bonus }));
      } catch (e) {}
    }

    if (Math.random() < SURPRISE_CHANCE) {
      const surprise = Math.floor(Math.random() * (SURPRISE_MAX - SURPRISE_MIN + 1)) + SURPRISE_MIN;
      await users.updateOne({ id: user.id }, { $inc: { balance: surprise } });
      await ctx.reply(`${t(lang, 'surprise_title')}\n\n${t(lang, 'surprise_text', { amount: surprise })}`);
    }

    await ctx.reply(
      `${t(lang, 'pay_success')}\n\n${t(lang, 'pay_success_balance', { amount: starsFromBalance })}\n\n${t(lang, 'pay_link')}: ${video.video_url}\n\n${t(lang, 'pay_dont_share')}`,
      mainMenu(user)
    );

    try {
      const admin = await users.findOne({ id: ADMIN_ID });
      await ctx.telegram.sendMessage(ADMIN_ID,
        t(getLang(admin), 'admin_payment_balance', {
          name: ctx.from.first_name,
          username: ctx.from.username || '—',
          id: user.id,
          title: video.title,
          amount: starsFromBalance
        }));
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

  let infoText = `${t(lang, 'pay_title')}\n\n`;
  if (starsFromBalance > 0) {
    infoText += t(lang, 'pay_from_balance', { from: starsFromBalance, to: starsToPay });
  } else {
    infoText += t(lang, 'pay_opening');
  }

  await ctx.reply(infoText);

  await ctx.replyWithInvoice({
    title: video.title + (discount ? ` (-${discount}%)` : ''),
    description: `Access to video "${video.title}"`,
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
  const lang = getLang(user);

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
      `${t(lang, 'sub_created')}\n\n${t(lang, 'sub_created_text', { date: endDate.toLocaleDateString('ru-RU') })}`,
      mainMenu(user)
    );

    try {
      const admin = await users.findOne({ id: ADMIN_ID });
      await ctx.telegram.sendMessage(ADMIN_ID,
        t(getLang(admin), 'admin_subscription', {
          name: ctx.from.first_name,
          username: ctx.from.username || '—',
          id: userId,
          amount
        }));
    } catch (e) {}
    return;
  }

  // ===== ПРОКРУТ =====
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
      `${t(lang, 'bonus_bought')}\n\n${t(lang, 'bonus_bought_text', { amount })}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'bonus_btn'), 'daily_bonus')],
        [Markup.button.callback(t(lang, 'btn_back'), 'main_menu')]
      ])
    );

    try {
      const admin = await users.findOne({ id: ADMIN_ID });
      await ctx.telegram.sendMessage(ADMIN_ID,
        t(getLang(admin), 'admin_bonus_spin', {
          name: ctx.from.first_name,
          username: ctx.from.username || '—',
          id: userId,
          amount
        }));
    } catch (e) {}
    return;
  }

  // ===== ОДНО ВИДЕО =====
  if (payload.startsWith('video_')) {
    const videoId = payload.replace('video_', '');
    const video = await findVideoById(videos, videoId);
    if (!video) return ctx.reply(t(lang, 'err_video_not_found'));

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

    let successText = `${t(lang, 'pay_success')}\n\n`;
    successText += t(lang, 'pay_success_text', { amount });
    if (starsFromBalance > 0) {
      successText += `\n${t(lang, 'pay_success_balance', { amount: starsFromBalance })}`;
    }
    successText += `\n\n${t(lang, 'pay_link')}: ${video.video_url}\n\n${t(lang, 'pay_dont_share')}`;

    await ctx.reply(successText, mainMenu(user));

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
        const refUser = await users.findOne({ id: user.referrer_id });
        await ctx.telegram.sendMessage(user.referrer_id,
          t(getLang(refUser), 'referral_income', { sum: fullPrice, bonus }));
      } catch (e) {}
    }

    if (Math.random() < SURPRISE_CHANCE) {
      const surprise = Math.floor(Math.random() * (SURPRISE_MAX - SURPRISE_MIN + 1)) + SURPRISE_MIN;
      await users.updateOne({ id: userId }, { $inc: { balance: surprise } });
      await ctx.reply(`${t(lang, 'surprise_title')}\n\n${t(lang, 'surprise_text', { amount: surprise })}`);
    }

    try {
      const admin = await users.findOne({ id: ADMIN_ID });
      await ctx.telegram.sendMessage(ADMIN_ID,
        t(getLang(admin), 'admin_payment', {
          name: ctx.from.first_name,
          username: ctx.from.username || '—',
          id: userId,
          title: video.title,
          balance: starsFromBalance,
          amount
        }));
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
    `• Admin panel\n\nUsers ${usersCount}, payments ${paymentsCount}, total ${total} ⭐, pending withdrawals ${pendingW}.\n\n` +
    `• Commands\n` +
    `/withdrawals — requests\n` +
    `/approve ID — approve\n` +
    `/reject ID — reject\n` +
    `/ban ID — ban\n` +
    `/unban ID — unban\n` +
    `/broadcast text — broadcast\n` +
    `/addpromo CODE PERCENT LIMIT — promo\n` +
    `/resetbonus ID|all — reset bonus`
  );
});

bot.command('withdrawals', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const w = await getCollection('withdrawals');
  const list = await w.find({ status: 'pending' }).toArray();
  if (!list.length) return ctx.reply('No requests');

  let text = `• Withdrawal requests\n\n`;
  list.forEach(x => {
    text += `ID ${x._id}. ${x.first_name} (@${x.username || '—'}). User ${x.user_id}. Amount ${x.amount} ⭐.\n\n`;
  });
  await ctx.reply(text);
});

bot.command('approve', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Usage: /approve ID');
  const w = await getCollection('withdrawals');
  await w.updateOne({ _id: new ObjectId(args[1]) }, { $set: { status: 'approved', approved_at: new Date() } });
  ctx.reply('• Approved');
});

bot.command('reject', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Usage: /reject ID');
  const w = await getCollection('withdrawals');
  const users = await getCollection('users');
  const item = await w.findOne({ _id: new ObjectId(args[1]) });
  if (!item) return ctx.reply('Not found');
  await users.updateOne({ id: item.user_id }, { $inc: { balance: item.amount } });
  await w.updateOne({ _id: new ObjectId(args[1]) }, { $set: { status: 'rejected', rejected_at: new Date() } });
  ctx.reply('• Rejected. Balance returned.');
});

bot.command('ban', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Usage: /ban ID');
  const users = await getCollection('users');
  await users.updateOne({ id: parseInt(args[1]) }, { $set: { is_banned: true } });
  ctx.reply(`• Banned: ${args[1]}`);
});

bot.command('unban', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Usage: /unban ID');
  const users = await getCollection('users');
  await users.updateOne({ id: parseInt(args[1]) }, { $set: { is_banned: false } });
  ctx.reply(`• Unbanned: ${args[1]}`);
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const text = ctx.message.text.replace('/broadcast', '').trim();
  if (!text) return ctx.reply('Usage: /broadcast text');

  const users = await getCollection('users');
  const list = await users.find({ is_banned: false }).toArray();

  await ctx.reply(`• Broadcast\n\nTotal ${list.length} users.`);
  let ok = 0, fail = 0;
  for (const u of list) {
    try {
      await ctx.telegram.sendMessage(u.id, text);
      ok++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { fail++; }
  }
  ctx.reply(`• Done\n\nSuccess ${ok}, errors ${fail}.`);
});

bot.command('addpromo', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 4) return ctx.reply('Usage: /addpromo CODE PERCENT LIMIT');

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

  ctx.reply(`• Promo created\n\nCode ${code}, discount ${percent}%, limit ${limit}.`);
});

bot.command('resetbonus', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply(
      `Usage:\n` +
      `/resetbonus ID — reset for one\n` +
      `/resetbonus all — reset for all`
    );
  }

  const users = await getCollection('users');

  if (args[1] === 'all') {
    const result = await users.updateMany(
      {},
      { $unset: { last_daily_bonus: '', temp_dice: '' } }
    );
    return ctx.reply(`• Reset for ${result.modifiedCount} users`);
  }

  const userId = parseInt(args[1]);
  const result = await users.updateOne(
    { id: userId },
    { $unset: { last_daily_bonus: '', temp_dice: '' } }
  );

  if (result.matchedCount === 0) {
    return ctx.reply(`• User ${userId} not found`);
  }

  ctx.reply(`• Bonus reset for ${userId}`);
});

module.exports = bot;