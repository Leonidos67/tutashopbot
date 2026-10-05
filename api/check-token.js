const { getCollection } = require('../lib/db');

module.exports = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false });

  const tokens = await getCollection('tokens');
  const record = await tokens.findOne({ token });

  if (!record || record.expires_at < new Date()) {
    return res.json({ valid: false });
  }

  // Опционально: удалить токен после использования
  // await tokens.deleteOne({ token });

  res.json({
    valid: true,
    video_url: record.video_url
  });
};