const { Markup } = require('telegraf');
const { t, getLang } = require('./i18n');

const mainMenu = (user) => {
  const lang = getLang(user);
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn_catalog'), 'catalog'),
      Markup.button.callback(t(lang, 'btn_my_videos'), 'my_videos')
    ],
    [
      Markup.button.callback(t(lang, 'btn_subscription'), 'subscription'),
      Markup.button.callback(t(lang, 'btn_profile'), 'profile')
    ],
    [
      Markup.button.callback(t(lang, 'btn_bonus'), 'daily_bonus'),
      Markup.button.callback(t(lang, 'btn_how'), 'how_it_works')
    ],
    [
      Markup.button.callback(t(lang, 'btn_support'), 'support'),
      Markup.button.callback(t(lang, 'btn_lang'), 'change_lang')
    ]
  ]);
};

const backToMenu = (user) => {
  const lang = getLang(user);
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn_back'), 'main_menu')]
  ]);
};

module.exports = { mainMenu, backToMenu };