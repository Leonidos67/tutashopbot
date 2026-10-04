const { Markup } = require('telegraf');

const mainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📁 Каталог', 'catalog'), Markup.button.callback('🎁 Пакеты', 'bundles')],
  [Markup.button.callback('📅 Подписка', 'subscription'), Markup.button.callback('🎬 Мои видео', 'my_videos')],
  [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🎲 Бонус', 'daily_bonus')],
  [Markup.button.callback('🆘 Поддержка', 'support')]
]);

const backToMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('« В меню', 'main_menu')]
]);

module.exports = { mainMenu, backToMenu };