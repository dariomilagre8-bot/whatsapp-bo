// src/engine/sender.js

async function sendText(phone, text, evolutionConfig) {
  const { apiUrl, apiKey, instance } = evolutionConfig;
  const target = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: target,
        text: text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[SEND] FAIL to ${phone}: ${res.status} ${err}`);
      return false;
    }

    console.log(`[SEND] OK → ${phone} (${text.substring(0, 60)}...)`);
    return true;
  } catch (err) {
    console.error(`[SEND] ERROR to ${phone}:`, err.message);
    return false;
  }
}

module.exports = { sendText };
