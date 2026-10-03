const { Markup } = require('telegraf');

module.exports = {
  mainMenu: () => Markup.inlineKeyboard([
    [Markup.button.callback('📁 Каталог', 'catalog')],
    [Markup.button.callback('👤 Профиль', 'profile')]
  ]),

  catalogMenu: (videos) => Markup.inlineKeyboard(
    videos.map(v => [
      Markup.button.callback(`${v.title} — ${v.price}⭐`, `buy_${v.slug}`)
    ])
  )
};