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

        <div className="mb-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Netflix Individual</p>
            <p className="mt-1 text-2xl font-bold">4.500 Kz</p>
            <p className="text-xs text-gray-500">1 slot</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Netflix Partilha</p>
            <p className="mt-1 text-2xl font-bold">5.500 Kz</p>
            <p className="text-xs text-gray-500">2 slots</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-gray-400">Prime Video Individual</p>
            <p className="mt-1 text-2xl font-bold">3.500 Kz</p>
            <p className="text-xs text-gray-500">1 slot</p>
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
