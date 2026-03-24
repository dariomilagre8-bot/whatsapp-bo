'use strict';

const { detectIntent, INTENTS } = require('../../../../src/engine/intentDetector');

describe('unit pipeline — intent sanity', () => {
  it('Bom dia → SAUDACAO', () => {
    const { intent } = detectIntent({ text: 'Bom dia', clientSlug: 'streamzone' });
    expect(intent).toBe(INTENTS.SAUDACAO);
  });
});
