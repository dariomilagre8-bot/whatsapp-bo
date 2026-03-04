// src/integrations/evolution.js
// Wrapper da Evolution API — utilitários adicionais além do sender básico

async function getInstanceStatus(evolutionConfig) {
  const { apiUrl, apiKey, instance } = evolutionConfig;
  try {
    const res = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { 'apikey': apiKey },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[EVOLUTION] getInstanceStatus error:', err.message);
    return null;
  }
}

async function sendImage(phone, imageUrl, caption, evolutionConfig) {
  const { apiUrl, apiKey, instance } = evolutionConfig;
  const target = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

  try {
    const res = await fetch(`${apiUrl}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: target,
        mediatype: 'image',
        media: imageUrl,
        caption: caption || '',
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[EVOLUTION] sendImage error:', err.message);
    return false;
  }
}

module.exports = { getInstanceStatus, sendImage };
