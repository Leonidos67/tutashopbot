// lib/i18n.js

const translations = {
  ru: {
    // Главное меню
    welcome:
      `• EBLA TUTA\n\n` +
      `Добро пожаловать в бота с эксклюзивными видео. Здесь можно купить доступ к каталогу, получить бонус, пригласить друзей и заработать на рефералах.`,
    main_menu: `• Главное меню\n\nВыберите раздел в меню ниже.`,
    
    // Кнопки меню
    btn_catalog: '📁 Каталог',
    btn_my_videos: '🎬 Мои видео',
    btn_subscription: '📅 Подписка',
    btn_profile: '👤 Профиль',
    btn_bonus: '🎲 Бонус',
    btn_how: '❓ Как это работает',
    btn_support: '🆘 Поддержка',
    btn_lang: '🌐 Язык',
    btn_back: '« В меню',
    btn_back_short: '« Назад',
    
    // Каталог
    catalog_empty: 'Каталог пуст',
    catalog_title: '• Каталог видео',
    catalog_desc: 'Все доступные видео с ценами.',
    catalog_price: 'Цена',
    catalog_buy: 'Купить',
    catalog_list: 'Показать списком',
    catalog_cards: 'Показать карточками',
    
    // Профиль
    profile_title: '• Профиль',
    profile_id: 'Ваш ID',
    profile_friends: 'Приглашено друзей',
    profile_balance: 'Баланс',
    profile_earned: 'Заработано',
    profile_ref_link: '• Реферальная ссылка',
    profile_ref_info: 'За покупку друга — {percent}%. Вывод — от {min} ⭐.',
    profile_withdraw: '• Вывести',
    
    // Бонус
    bonus_title: '• Ежедневный бонус',
    bonus_desc: 'Бросаем кость (1-6), затем рулетка (×1 — ×3). Можно получить от 1 до 18 ⭐.',
    bonus_more: 'Подробнее',
    bonus_play: 'Бросить кость',
    bonus_already: 'Вы уже играли сегодня. Следующий бесплатный прокрут через {time}.',
    bonus_buy_spin: 'Купить прокрут за {price} ⭐',
    bonus_roll_dice: '• Кость',
    bonus_dice_result: 'Выпало число {value}. Теперь рулетка (×1 — ×3).',
    bonus_roll_slot: 'Крутить',
    bonus_result: '• Твой бонус',
    bonus_result_text: 'Кость {dice}, рулетка ×{mult}. Итого +{bonus} ⭐ на баланс.',
    bonus_next: 'Следующий бесплатный прокрут через 24 часа или купите за {price} ⭐.',
    bonus_bought: '• Прокрут куплен',
    bonus_bought_text: 'Оплачено {amount} ⭐. Открывайте раздел «Бонус» и играйте.',
    bonus_btn: '• Бонус',
    
    // Подписка
    sub_title: '• Подписка на месяц',
    sub_desc: 'Доступ ко всем видео каталога. Стоимость {price} ⭐ за {days} дней.',
    sub_active: '• Подписка активна',
    sub_active_text: 'У вас осталось {days} дн. Подписка действует до {date}.',
    sub_buy: 'Купить',
    sub_created: '• Подписка оформлена',
    sub_created_text: 'Действует до {date}. Все видео каталога доступны бесплатно.',
    
    // Мои видео
    myvideos_title: '• Мои видео',
    myvideos_empty: 'У вас пока нет купленных видео. Загляните в каталог — там есть что выбрать.',
    myvideos_desc: 'Здесь собраны все купленные вами видео ({count}).',
    myvideos_go: '• В каталог',
    
    // Поддержка
    support_title: '• Поддержка',
    support_text: 'По всем вопросам пишите: {user}',
    
    // Как это работает
    how_title: '• Как это работает',
    how_text:
      `Выбираете видео в каталоге, оплачиваете звёздами Telegram и сразу получаете ссылку на просмотр.\n\n` +
      `Также в боте есть ежедневный бонус, реферальная программа на {percent}%, подписка на месяц, промокоды и вывод звёзд от {min}.`,
    how_more: 'Подробнее на сайте',
    how_go: '• В каталог',
    
    // Оплата
    pay_title: '• Оплата',
    pay_opening: 'Открываю окно оплаты.',
    pay_from_balance: 'С баланса спишется {from} ⭐, звёздами нужно доплатить {to} ⭐.',
    pay_success: '• Оплата прошла',
    pay_success_text: 'Оплачено звёздами {amount} ⭐.',
    pay_success_balance: 'Списано с баланса {amount} ⭐.',
    pay_link: 'Ссылка на видео',
    pay_dont_share: 'Не передавайте никому.',
    
    // Промокод
    promo_already: '• Промокод уже активирован',
    promo_already_text: 'Код {code} даёт скидку {discount}%. Он применится при следующей покупке.',
    promo_enter: '• Активация промокода',
    promo_enter_text: 'Отправьте код следующим сообщением.',
    promo_notfound: '• Промокод не найден',
    promo_notfound_text: 'Код "{code}" не существует или неактивен.',
    promo_used: '• Промокод исчерпан',
    promo_used_text: 'Код "{code}" использован максимальное число раз ({max}).',
    promo_expired: '• Промокод истёк',
    promo_expired_text: 'Код "{code}" действовал до {date}.',
    promo_activated: '• Промокод активирован',
    promo_activated_text: 'Код {code} даёт скидку {discount}%. Осталось активаций: {left}.',
    promo_cancel: '« Отмена',
    
    // Вывод
    withdraw_created: '• Заявка создана',
    withdraw_created_text: 'Сумма вывода {amount} ⭐. Админ свяжется с вами в течение 24 часов.',
    withdraw_no_money: 'Недостаточно средств',
    
    // Сюрприз
    surprise_title: '• Сюрприз',
    surprise_text: 'Тебе повезло! Бонус +{amount} ⭐.',
    
    // Ошибки / системные
    err_too_many: 'Слишком много запросов. Подожди минуту.',
    err_blocked:
      `• Доступ закрыт\n\n` +
      `Бот считает, что ваш аккаунт выглядит как бот. Если это ошибка — напишите {support}.`,
    err_banned: '• Доступ закрыт\n\nВы забанены. Если считаете, что произошла ошибка — напишите {support}.',
    err_video_not_found: 'Видео не найдено',
    err_end_catalog: 'Конец каталога',
    
    // Язык
    lang_title: '• Язык / Language',
    lang_text: 'Выберите язык интерфейса:',
    lang_set: '✅ Язык изменён на русский',
    lang_ru: '🇷🇺 Русский',
    lang_en: '🇬🇧 English',
  },

  en: {
    welcome:
      `• EBLA TUTA\n\n` +
      `Welcome to the bot with exclusive videos. Here you can buy access to the catalog, get a bonus, invite friends and earn on referrals.`,
    main_menu: `• Main menu\n\nChoose a section below.`,
    
    btn_catalog: '📁 Catalog',
    btn_my_videos: '🎬 My videos',
    btn_subscription: '📅 Subscription',
    btn_profile: '👤 Profile',
    btn_bonus: '🎲 Bonus',
    btn_how: '❓ How it works',
    btn_support: '🆘 Support',
    btn_lang: '🌐 Language',
    btn_back: '« Menu',
    btn_back_short: '« Back',
    
    catalog_empty: 'Catalog is empty',
    catalog_title: '• Video catalog',
    catalog_desc: 'All available videos with prices.',
    catalog_price: 'Price',
    catalog_buy: 'Buy',
    catalog_list: 'Show as list',
    catalog_cards: 'Show as cards',
    
    profile_title: '• Profile',
    profile_id: 'Your ID',
    profile_friends: 'Friends invited',
    profile_balance: 'Balance',
    profile_earned: 'Earned',
    profile_ref_link: '• Referral link',
    profile_ref_info: 'For a friend\'s purchase — {percent}%. Withdraw from {min} ⭐.',
    profile_withdraw: '• Withdraw',
    
    bonus_title: '• Daily bonus',
    bonus_desc: 'Roll a dice (1-6), then a multiplier (×1 — ×3). You can get from 1 to 18 ⭐.',
    bonus_more: 'Learn more',
    bonus_play: 'Roll dice',
    bonus_already: 'You already played today. Next free spin in {time}.',
    bonus_buy_spin: 'Buy spin for {price} ⭐',
    bonus_roll_dice: '• Dice',
    bonus_dice_result: 'You rolled {value}. Now the multiplier (×1 — ×3).',
    bonus_roll_slot: 'Spin',
    bonus_result: '• Your bonus',
    bonus_result_text: 'Dice {dice}, multiplier ×{mult}. Total +{bonus} ⭐ to balance.',
    bonus_next: 'Next free spin in 24 hours or buy one for {price} ⭐.',
    bonus_bought: '• Spin purchased',
    bonus_bought_text: 'Paid {amount} ⭐. Open the «Bonus» section and play.',
    bonus_btn: '• Bonus',
    
    sub_title: '• Monthly subscription',
    sub_desc: 'Access to all videos in the catalog. Price {price} ⭐ for {days} days.',
    sub_active: '• Subscription active',
    sub_active_text: 'You have {days} days left. Valid until {date}.',
    sub_buy: 'Buy',
    sub_created: '• Subscription activated',
    sub_created_text: 'Valid until {date}. All catalog videos are free.',
    
    myvideos_title: '• My videos',
    myvideos_empty: 'You have no purchased videos yet. Check the catalog.',
    myvideos_desc: 'Here are all your purchased videos ({count}).',
    myvideos_go: '• Catalog',
    
    support_title: '• Support',
    support_text: 'For any questions, write to: {user}',
    
    how_title: '• How it works',
    how_text:
      `Choose a video in the catalog, pay with Telegram Stars and get a link to watch instantly.\n\n` +
      `The bot also has a daily bonus, {percent}% referral program, monthly subscription, promo codes and withdrawal from {min} stars.`,
    how_more: 'Learn more on the site',
    how_go: '• Catalog',
    
    pay_title: '• Payment',
    pay_opening: 'Opening payment window.',
    pay_from_balance: '{from} ⭐ will be deducted from balance, {to} ⭐ to pay with stars.',
    pay_success: '• Payment successful',
    pay_success_text: 'Paid with stars: {amount} ⭐.',
    pay_success_balance: 'Deducted from balance: {amount} ⭐.',
    pay_link: 'Video link',
    pay_dont_share: 'Do not share with anyone.',
    
    promo_already: '• Promo already activated',
    promo_already_text: 'Code {code} gives {discount}% discount. It will be applied on your next purchase.',
    promo_enter: '• Promo activation',
    promo_enter_text: 'Send the code in the next message.',
    promo_notfound: '• Promo not found',
    promo_notfound_text: 'Code "{code}" doesn\'t exist or is inactive.',
    promo_used: '• Promo used up',
    promo_used_text: 'Code "{code}" was used maximum number of times ({max}).',
    promo_expired: '• Promo expired',
    promo_expired_text: 'Code "{code}" was valid until {date}.',
    promo_activated: '• Promo activated',
    promo_activated_text: 'Code {code} gives {discount}% discount. Activations left: {left}.',
    promo_cancel: '« Cancel',
    
    withdraw_created: '• Withdrawal created',
    withdraw_created_text: 'Withdrawal amount {amount} ⭐. Admin will contact you within 24 hours.',
    withdraw_no_money: 'Insufficient funds',
    
    surprise_title: '• Surprise',
    surprise_text: 'You got lucky! Bonus +{amount} ⭐.',
    
    err_too_many: 'Too many requests. Wait a minute.',
    err_blocked:
      `• Access denied\n\n` +
      `The bot thinks your account looks like a bot. If it\'s a mistake, write to {support}.`,
    err_banned: '• Access denied\n\nYou are banned. If you think it\'s a mistake, write to {support}.',
    err_video_not_found: 'Video not found',
    err_end_catalog: 'End of catalog',
    
    lang_title: '• Language / Язык',
    lang_text: 'Choose interface language:',
    lang_set: '✅ Language changed to English',
    lang_ru: '🇷🇺 Русский',
    lang_en: '🇬🇧 English',
  }
};

function t(lang, key, params = {}) {
  const dict = translations[lang] || translations.ru;
  let text = dict[key] || translations.ru[key] || key;
  
  // Заменяем {param} на значения
  Object.keys(params).forEach(k => {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
  });
  
  return text;
}

function getLang(user) {
  return user?.lang || 'ru';
}

module.exports = { t, getLang, translations };