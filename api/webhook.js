require('dotenv').config();
const bot = require('../lib/bot');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(200).send('OK');
  }
};
