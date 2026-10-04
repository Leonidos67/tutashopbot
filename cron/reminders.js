const { getCollection } = require('../lib/db');

module.exports = async (req, res) => {
  try {
    const bot = require('../lib/bot');
    const pending = await getCollection('pending_payments');
    const users = await getCollection('users');

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const toRemind = await pending.find({
      reminded: false,
      created_at: { $lt: dayAgo }
    }).toArray();

    let sent = 0;
    for (const p of toRemind) {
      try {
        const user = await users.findOne({ id: p.user_id });
        if (!user || user.is_banned) continue;

        await bot.telegram.sendMessage(p.user_id,
          `🎬 Ты не завершил покупку\n\n` +
          `Видео: ${p.video_title}\n` +
          `Цена: ${p.price}⭐\n\n` +
          `Продолжить?`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '💳 Оплатить', callback_data: `rebuy_${p.video_slug}` }
              ]]
            }
          }
        );

        await pending.updateOne({ _id: p._id }, { $set: { reminded: true } });
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {}
    }

    res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
};