import { useState } from 'react'
import CheckoutModal from './components/CheckoutModal'

function App() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">StreamZone Connect</h1>
      </header>

      <main className="flex flex-col items-center justify-center px-4 pt-24 text-center">
        <h2 className="mb-4 text-4xl font-extrabold sm:text-5xl">
          Streaming Premium<br />a preços acessíveis
        </h2>
        <p className="mb-8 max-w-md text-gray-300">
          Netflix e Prime Video com entrega imediata via WhatsApp. Escolhe o teu plano e começa a assistir hoje.
        </p>

        {/* FIX: catálogo completo com preços corretos */}
        <p className="mb-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">Netflix</p>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Individual</p>
            <p className="mt-1 text-2xl font-bold">5.000 Kz</p>
            <p className="text-xs text-gray-500">1 perfil</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Partilha</p>
            <p className="mt-1 text-2xl font-bold">9.000 Kz</p>
            <p className="text-xs text-gray-500">2 perfis</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Família</p>
            <p className="mt-1 text-2xl font-bold">13.500 Kz</p>
            <p className="text-xs text-gray-500">3 perfis</p>
          </div>
        </div>

        <p className="mb-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">Prime Video</p>
        <div className="mb-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Individual</p>
            <p className="mt-1 text-2xl font-bold">3.000 Kz</p>
            <p className="text-xs text-gray-500">1 perfil</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Partilha</p>
            <p className="mt-1 text-2xl font-bold">5.500 Kz</p>
            <p className="text-xs text-gray-500">2 perfis</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Família</p>
            <p className="mt-1 text-2xl font-bold">8.000 Kz</p>
            <p className="text-xs text-gray-500">3 perfis</p>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-indigo-600 px-8 py-3 text-lg font-semibold hover:bg-indigo-700 transition cursor-pointer"
        >
          Fazer Pedido
        </button>
      </main>

      <CheckoutModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}

export default App
