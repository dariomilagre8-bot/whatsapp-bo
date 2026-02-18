import { useState } from 'react'
import Navbar from './components/Navbar'
import FeatureCard from './components/FeatureCard'
import PlanCard from './components/PlanCard'
import FAQ from './components/FAQ'
import Footer from './components/Footer'
import CheckoutModal from './components/CheckoutModal'

const NETFLIX_PLANS = [
  { name: 'Individual', price: 5000, profiles: 1 },
  { name: 'Partilha', price: 9000, profiles: 2, popular: true },
  { name: 'Família', price: 13500, profiles: 3 },
]

const PRIME_PLANS = [
  { name: 'Individual', price: 3000, profiles: 1 },
  { name: 'Partilha', price: 5500, profiles: 2, popular: true },
  { name: 'Família', price: 8000, profiles: 3 },
]

const FEATURES = [
  {
    icon: '\u26A1',
    title: 'Entrega Imediata',
    description: 'Recebe os teus perfis via WhatsApp em menos de 30 minutos após confirmação.',
  },
  {
    icon: '\uD83D\uDCB0',
    title: 'Preços Acessíveis',
    description: 'Streaming premium a partir de 3.000 Kz. Os melhores preços de Angola.',
  },
  {
    icon: '\uD83D\uDCF1',
    title: 'Suporte WhatsApp',
    description: 'Equipa de suporte disponível 24/7 directamente no WhatsApp.',
  },
  {
    icon: '\uD83D\uDD12',
    title: 'Pagamento Fácil',
    description: 'Transferência BAI ou Multicaixa Express. Simples e seguro.',
  },
]

const STEPS = [
  { number: '1', title: 'Escolhe o Plano', description: 'Seleciona Netflix ou Prime Video e o plano ideal para ti.' },
  { number: '2', title: 'Faz o Pagamento', description: 'Transfere via BAI ou Multicaixa Express e envia o comprovativo.' },
  { number: '3', title: 'Recebe os Perfis', description: 'Credenciais entregues via WhatsApp. Começa a assistir!' },
]

function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [activePlatform, setActivePlatform] = useState<'netflix' | 'prime'>('netflix')

  const plans = activePlatform === 'netflix' ? NETFLIX_PLANS : PRIME_PLANS

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar onCheckout={() => setModalOpen(true)} />

      {/* Hero Section */}
      <section className="hero-gradient relative overflow-hidden px-4 pt-28 pb-20 sm:pt-36 sm:pb-28">
        {/* Decorative blurs */}
        <div className="pointer-events-none absolute top-20 -left-32 h-72 w-72 rounded-full bg-indigo-600/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 -right-32 h-72 w-72 rounded-full bg-purple-600/20 blur-[100px]" />

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="animate-fade-in-up mb-6 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold text-indigo-300 sm:text-sm">
            Netflix &amp; Prime Video em Angola
          </div>
          <h1 className="animate-fade-in-up animation-delay-200 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Streaming Premium<br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              a preços acessíveis
            </span>
          </h1>
          <p className="animate-fade-in-up animation-delay-400 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            Entrega imediata via WhatsApp. Escolhe o teu plano, faz o pagamento e começa a assistir hoje mesmo.
          </p>
          <div className="animate-fade-in-up animation-delay-600 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <a
              href="#planos"
              className="w-full rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 sm:w-auto"
            >
              Ver Planos
            </a>
            <a
              href="#como-funciona"
              className="w-full rounded-xl border border-white/20 px-8 py-3.5 text-base font-semibold text-gray-300 transition hover:border-white/40 hover:text-white sm:w-auto"
            >
              Como Funciona
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Porquê a StreamZone?</h2>
          <p className="mt-3 text-gray-400">Tudo o que precisas para o teu entretenimento</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* Plans Catalog */}
      <section id="planos" className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Escolhe o Teu Plano</h2>
          <p className="mt-3 text-gray-400">Planos mensais, sem fidelização</p>
        </div>

        {/* Platform toggle */}
        <div className="mx-auto mb-10 flex max-w-xs overflow-hidden rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setActivePlatform('netflix')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition cursor-pointer ${
              activePlatform === 'netflix'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Netflix
          </button>
          <button
            onClick={() => setActivePlatform('prime')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition cursor-pointer ${
              activePlatform === 'prime'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Prime Video
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {plans.map((p) => (
            <PlanCard
              key={p.name + activePlatform}
              {...p}
              onSelect={() => setModalOpen(true)}
            />
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="border-t border-white/5 bg-gray-900/50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Como Funciona</h2>
            <p className="mt-3 text-gray-400">3 passos simples para começares</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.number} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div className="pointer-events-none absolute top-8 left-[60%] hidden h-0.5 w-[80%] bg-gradient-to-r from-indigo-600/50 to-transparent sm:block" />
                )}
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20 text-2xl font-extrabold text-indigo-400">
                  {s.number}
                </div>
                <h3 className="mb-2 text-lg font-bold text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQ />

      {/* CTA before footer */}
      <section className="px-4 py-16 text-center sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Pronto para começar?</h2>
          <p className="mt-3 text-gray-400">Junta-te a centenas de clientes satisfeitos em Angola</p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-6 rounded-xl bg-indigo-600 px-10 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 cursor-pointer"
          >
            Fazer Pedido Agora
          </button>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Checkout Modal */}
      <CheckoutModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* WhatsApp Widget */}
      <a
        href="https://wa.me/244946014060?text=Olá, preciso de ajuda com a StreamZone"
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-pulse fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-2xl text-white shadow-lg transition hover:bg-green-500 hover:scale-105 sm:bottom-6 sm:right-6"
        aria-label="Contactar via WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </div>
  )
}

export default App
