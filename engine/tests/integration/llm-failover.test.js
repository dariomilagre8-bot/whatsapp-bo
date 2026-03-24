'use strict';

jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(() => Promise.reject(new Error('timeout simulado após 5s'))),
    },
  })),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: jest.fn(() =>
        Promise.resolve({ response: { text: () => 'Resposta entregue via fallback Gemini' } }),
      ),
    })),
  })),
}));

describe('llm failover', () => {
  let logSpy;
  let errSpy;

  beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    process.env.GEMINI_API_KEY = 'test-gemini';
    const llm = require('../../lib/llm');
    llm.init(process.env.GEMINI_API_KEY);
  });

  afterAll(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('primário falha → fallback responde e regista Gemini nos logs', async () => {
    const llm = require('../../lib/llm');
    const out = await llm.generate('sistema', 'olá cliente', [], null);
    expect(out).toBe('Resposta entregue via fallback Gemini');
    const blob = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(blob).toMatch(/Gemini \(fallback\)/);
  });
});
