'use strict';

function evolutionBody(text, remoteJid, messageId, instanceName = 'TestEvolution') {
  return {
    instance: instanceName,
    data: {
      key: { id: messageId, remoteJid, fromMe: false },
      message: { conversation: text },
      pushName: 'TestUser',
    },
  };
}

module.exports = { evolutionBody };
