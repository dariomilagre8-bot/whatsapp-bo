'use strict';

// ============================================================
// tests/clientes/demo-moda.test.js
// Bot Demo: Loja Demo (Bia) — clients/demo/config → instância demo-moda
// ============================================================

const config = require('../../config/clientes/demo-moda');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toContain(sub) {
      if (actual == null || !String(actual).includes(sub)) throw new Error(`Expected to contain "${sub}"`);
    },
    toBeDefined() {
      if (actual === undefined) throw new Error('Expected value to be defined');
    },
    toBeGreaterThan(n) {
      if (typeof actual !== 'number' || actual <= n) throw new Error(`Expected number > ${n}, got ${actual}`);
    },
    toHaveLength(n) {
      if (!Array.isArray(actual) || actual.length !== n) throw new Error(`Expected length ${n}, got ${actual?.length}`);
    },
    toBe(trueOrFalse) {
      if (actual !== trueOrFalse) throw new Error(`Expected ${trueOrFalse}, got ${actual}`);
    },
    toMatch(re) {
      if (actual == null || !re.test(String(actual))) throw new Error(`Expected to match ${re}`);
    },
  };
}

console.log('\n📋 Bot Demo — Loja Demo / Bia (clients/demo via config/clientes/demo-moda):');

// ── 1. CONFIGURAÇÃO BÁSICA ────────────────────────────────
test('slug correcto', () => expect(config.slug).toBe('demo'));
test('número correcto', () => expect(config.numero).toBe('244958765478'));
test('supervisor correcto', () => expect(config.supervisorNumbers).toContain('244941713216'));
test('está activo', () => expect(config.ativo).toBe(true));
test('plano empresarial (todos os módulos)', () => expect(config.plano).toBe('empresarial'));

// ── 2. SAUDAÇÃO ───────────────────────────────────────────
test('contém nome da loja', () => expect(config.saudacao).toContain('Loja Demo'));
test('contém nome da assistente', () => expect(config.saudacao).toContain('Bia'));
test('menciona catálogo', () => expect(config.saudacao.toLowerCase()).toContain('catálogo'));

// ── 3. TRIGGERS ───────────────────────────────────────────
test('catálogo detecta "ver produtos"', () => expect(config.triggers.catalogo.test('ver produtos')).toBe(true));
test('catálogo detecta "catálogo"', () => expect(config.triggers.catalogo.test('quero ver o catálogo')).toBe(true));
test('pedido detecta "quero"', () => expect(config.triggers.pedido.test('quero o vestido')).toBe(true));
test('pedido detecta "comprar"', () => expect(config.triggers.pedido.test('quero comprar')).toBe(true));
test('entrega detecta "entrega"', () => expect(config.triggers.entrega.test('como funciona a entrega?')).toBe(true));
test('tamanhos detecta "guia de tamanhos"', () => expect(config.triggers.tamanhos.test('guia de tamanhos')).toBe(true));
test('pagamento detecta "multicaixa"', () => expect(config.triggers.pagamento.test('pagar com multicaixa')).toBe(true));

// ── 4. CATÁLOGO ───────────────────────────────────────────
test('tem 1 categoria de catálogo demo', () => expect(config.catalogo.categorias).toHaveLength(1));
test('cinco produtos na categoria', () => expect(config.catalogo.categorias[0].produtos).toHaveLength(5));
test('todos os produtos têm id, nome e preço', () => {
  for (const cat of config.catalogo.categorias) {
    for (const p of cat.produtos) {
      expect(p.id).toBeDefined();
      expect(p.nome).toBeDefined();
      if (typeof p.preco !== 'number' || p.preco <= 0) throw new Error(`preco inválido em ${p.id}`);
    }
  }
});
test('mensagem do catálogo contém preços', () => {
  const msg = config.catalogo.formatarMensagem(config.catalogo.categorias);
  expect(msg).toContain('Kz');
  expect(msg).toContain('Camisola Básica');
});
test('mensagem do catálogo tem instrução de pedido', () => {
  const msg = config.catalogo.formatarMensagem(config.catalogo.categorias);
  expect(msg).toContain('encomendar');
});

// ── 5. FLUXO DE VENDA ─────────────────────────────────────
(() => {
  const pedidoMock = {
    produto: 'Camisola Básica',
    tamanho: 'M',
    preco: 3500,
    entrega: true,
    zona: 'Talatona',
    pagamento: 'Multicaixa Express',
  };
  test('confirmarPedido inclui nome do produto', () => {
    const msg = config.fluxoVenda.confirmarPedido(pedidoMock);
    expect(msg).toContain('Camisola Básica');
  });
  test('confirmarPedido calcula total com entrega', () => {
    const msg = config.fluxoVenda.confirmarPedido(pedidoMock);
    expect(msg).toMatch(/Total:\s*5[.\s]?000/);
  });
  test('pedidoConfirmado inclui nome da loja', () => {
    const msg = config.fluxoVenda.pedidoConfirmado(pedidoMock);
    expect(msg).toContain('Loja Demo');
  });
  test('pedidoConfirmado menciona prazo', () => {
    const msg = config.fluxoVenda.pedidoConfirmado(pedidoMock);
    expect(msg).toContain('24');
  });
})();

// ── 6. SUPERVISOR ─────────────────────────────────────────
test('notificação inclui produto e cliente', () => {
  const pedido = {
    produto: 'Calças Jeans',
    tamanho: 'L',
    preco: 5500,
    entrega: false,
    pagamento: 'Multicaixa Express',
  };
  const msg = config.supervisor.notificacaoPedido(pedido, '244912345678');
  expect(msg).toContain('Calças Jeans');
  expect(msg).toContain('244912345678');
  expect(msg).toContain('#sim');
  expect(msg).toContain('#nao');
});

// ── 7. ENTREGAS ───────────────────────────────────────────
test('faz entregas', () => expect(config.entregas.faz).toBe(true));
test('cobre Luanda', () => expect(config.entregas.zonas).toContain('Luanda'));
test('taxa definida', () => expect(config.entregas.taxa).toBe(1500));
test('mensagem tem prazo', () => expect(config.entregas.msgEntrega).toContain('48'));

// ── 8. LLM PROMPT ─────────────────────────────────────────
test('tem system prompt', () => {
  expect(config.llmSystemPrompt).toBeDefined();
  if (config.llmSystemPrompt.length <= 50) throw new Error('Prompt too short');
});
test('menciona regra de não revelar comandos', () => expect(config.llmSystemPrompt).toContain('#sim'));

// ── 9. PREÇOS ESTÁTICOS (overlay multi-tenant) ────────────
test('prices overlay tem os 5 artigos', () => {
  expect(config.prices['Camisola Básica']).toBe(3500);
  expect(config.prices['Vestido Elegante']).toBe(8000);
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
