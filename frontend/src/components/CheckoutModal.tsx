import { useState, type FormEvent } from 'react'

// FIX: proxy via vercel.json rewrites — requests relativos, sem mixed content
const CATALOGO = {
  Netflix: {
    planos: [
      { label: 'Individual — 1 slot — 4.500 Kz', value: 'individual', slots: 1 },
      { label: 'Partilha — 2 slots — 5.500 Kz', value: 'partilha', slots: 2 },
    ],
  },
  'Prime Video': {
    planos: [
      { label: 'Individual — 1 slot — 3.500 Kz', value: 'individual', slots: 1 },
    ],
  },
} as const

type Plataforma = keyof typeof CATALOGO

interface Props {
  open: boolean
  onClose: () => void
}

export default function CheckoutModal({ open, onClose }: Props) {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('')
  const [plano, setPlano] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const planos = plataforma ? CATALOGO[plataforma].planos : []
  const selectedPlano = planos.find((p) => p.value === plano)

  function resetForm() {
    setNome('')
    setWhatsapp('')
    setPlataforma('')
    setPlano('')
    setQuantidade(1)
    setMessage(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!plataforma || !plano || !selectedPlano) return

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/web-checkout', { // FIX: URL relativo, proxy via vercel.json
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          whatsapp,
          plataforma,
          plano,
          slots: selectedPlano.slots * quantidade,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: data.message || 'Pedido registado com sucesso!' })
      } else {
        setMessage({ type: 'error', text: data.message || 'Erro ao processar o pedido.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexão. Tenta novamente.' })
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={() => { resetForm(); onClose() }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer"
        >
          &times;
        </button>

        <h2 className="mb-4 text-xl font-bold text-gray-900">Fazer Pedido</h2>

        {message && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {message?.type === 'success' ? (
          <button
            onClick={() => { resetForm(); onClose() }}
            className="w-full rounded-lg bg-green-600 py-2.5 font-semibold text-white hover:bg-green-700 cursor-pointer"
          >
            Fechar
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp</label>
              <input
                type="tel"
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="244 9XX XXX XXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Plataforma</label>
              <select
                required
                value={plataforma}
                onChange={(e) => {
                  setPlataforma(e.target.value as Plataforma | '')
                  setPlano('')
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="">Selecionar plataforma</option>
                <option value="Netflix">Netflix</option>
                <option value="Prime Video">Prime Video</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Plano</label>
              <select
                required
                value={plano}
                onChange={(e) => setPlano(e.target.value)}
                disabled={!plataforma}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">Selecionar plano</option>
                {planos.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Quantidade</label>
              <input
                type="number"
                required
                min={1}
                max={10}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'A processar...' : 'Confirmar Pedido'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
