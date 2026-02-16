import { useState, useRef, type FormEvent } from 'react'

// FIX: catálogo com preços para cálculo em tempo real
const CATALOGO = {
  Netflix: {
    backendKey: 'netflix',
    planos: [
      { label: 'Individual — 1 perfil', value: 'individual', price: 5000, slots: 1 },
      { label: 'Partilha — 2 perfis', value: 'partilha', price: 9000, slots: 2 },
      { label: 'Família — 3 perfis', value: 'familia', price: 13500, slots: 3 },
    ],
  },
  'Prime Video': {
    backendKey: 'prime_video',
    planos: [
      { label: 'Individual — 1 perfil', value: 'individual', price: 3000, slots: 1 },
      { label: 'Partilha — 2 perfis', value: 'partilha', price: 5500, slots: 2 },
      { label: 'Família — 3 perfis', value: 'familia', price: 8000, slots: 3 },
    ],
  },
} as const

type Plataforma = keyof typeof CATALOGO

interface Props {
  open: boolean
  onClose: () => void
}

// FIX: formata preço em Kz
function fmtKz(v: number) {
  return v.toLocaleString('pt') + ' Kz'
}

export default function CheckoutModal({ open, onClose }: Props) {
  // FIX: 4-step checkout flow
  const [step, setStep] = useState(1)

  // Step 1 — dados cliente
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  // Step 2 — plano
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('')
  const [plano, setPlano] = useState('')
  const [quantidade, setQuantidade] = useState(1)

  // Step 3 — pagamento + upload
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Global
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const planos = plataforma ? CATALOGO[plataforma].planos : []
  const selectedPlano = planos.find((p) => p.value === plano)
  const totalPrice = selectedPlano ? selectedPlano.price * quantidade : 0

  function resetForm() {
    setStep(1)
    setNome('')
    setWhatsapp('')
    setPlataforma('')
    setPlano('')
    setQuantidade(1)
    setFile(null)
    setError('')
    setLoading(false)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  // FIX: validação por step
  function nextStep() {
    if (step === 1) {
      if (!nome.trim()) { setError('Preenche o nome completo.'); return }
      if (!/^9\d{8}$/.test(whatsapp.replace(/\s/g, ''))) { setError('Número inválido. Formato: 9XX XXX XXX'); return }
      setError('')
      setStep(2)
    } else if (step === 2) {
      if (!plataforma || !plano) { setError('Seleciona a plataforma e o plano.'); return }
      setError('')
      setStep(3)
    }
  }

  // FIX: envio do pedido + upload do comprovativo
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!plataforma || !selectedPlano || !file) {
      setError('Anexa o comprovativo de pagamento.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 1. Enviar pedido ao backend
      const cleanNum = '244' + whatsapp.replace(/\s/g, '')
      const res = await fetch('/api/web-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          whatsapp: cleanNum,
          plataforma,
          plano,
          slots: selectedPlano.slots * quantidade,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.message || 'Erro ao processar o pedido.')
        setLoading(false)
        return
      }

      // 2. Upload do comprovativo
      const fd = new FormData()
      fd.append('comprovativo', file)
      fd.append('nome', nome)
      fd.append('whatsapp', cleanNum)
      fd.append('plataforma', plataforma)
      fd.append('plano', plano)
      fd.append('quantidade', String(quantidade))
      fd.append('total', String(totalPrice))

      await fetch('/api/upload-comprovativo', { method: 'POST', body: fd })

      setStep(4)
    } catch {
      setError('Erro de conexão. Tenta novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer"
        >
          &times;
        </button>

        {/* FIX: step indicator */}
        {step < 4 && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex items-center gap-1 ${s === step ? 'text-indigo-600 font-bold' : ''}`}>
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${s <= step ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</span>
                {s === 1 && 'Dados'}
                {s === 2 && 'Plano'}
                {s === 3 && 'Pagamento'}
                {s < 3 && <span className="text-gray-300">›</span>}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* ======== STEP 1: Dados do cliente ======== */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Dados do cliente</h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome completo</label>
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
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Número de WhatsApp (para entrega dos perfis)
              </label>
              <input
                type="tel"
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="9XX XXX XXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button
              type="button"
              onClick={nextStep}
              className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Continuar
            </button>
          </div>
        )}

        {/* ======== STEP 2: Escolha do plano ======== */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Escolhe o teu plano</h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Plataforma</label>
              <select
                required
                value={plataforma}
                onChange={(e) => { setPlataforma(e.target.value as Plataforma | ''); setPlano('') }}
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
                    {p.label} — {fmtKz(p.price)}
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
                max={5}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.min(5, Math.max(1, Number(e.target.value))))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            {/* FIX: preço total em tempo real */}
            {selectedPlano && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-center">
                <p className="text-sm text-indigo-600">Total a pagar</p>
                <p className="text-2xl font-bold text-indigo-700">{fmtKz(totalPrice)}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setError(''); setStep(1) }}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ======== STEP 3: Pagamento + Upload ======== */}
        {step === 3 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Pagamento</h2>

            {/* FIX: valor total */}
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-center">
              <p className="text-sm text-indigo-600">Total a pagar</p>
              <p className="text-2xl font-bold text-indigo-700">{fmtKz(totalPrice)}</p>
            </div>

            {/* FIX: coordenadas bancárias */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Coordenadas bancárias</p>
              <div>
                <p className="font-medium">BAI</p>
                <p className="font-mono text-xs">IBAN: 0040.0000.7685.3192.1018.3</p>
                <p>Titular: Braulio Manuel</p>
              </div>
              <div>
                <p className="font-medium">Multicaixa Express</p>
                <p className="font-mono text-xs">946014060</p>
              </div>
            </div>

            {/* FIX: regras de aviso */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p>⚠️ O pacote adquirido não pode ser revertido após confirmação.</p>
              <p>📎 O comprovativo deve ser enviado em formato PDF ou imagem (JPG/PNG).</p>
            </div>

            {/* FIX: upload comprovativo */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Comprovativo de pagamento</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f && f.size > 5 * 1024 * 1024) {
                    setError('Ficheiro demasiado grande (máx. 5MB)')
                    setFile(null)
                    return
                  }
                  setError('')
                  setFile(f || null)
                }}
                className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
              />
              {file && <p className="mt-1 text-xs text-green-600">📎 {file.name}</p>}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setError(''); setStep(2) }}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'A processar...' : 'Enviar Pedido'}
              </button>
            </div>
          </form>
        )}

        {/* ======== STEP 4: Confirmação ======== */}
        {step === 4 && (
          <div className="space-y-4 text-center">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold text-gray-900">Pedido registado com sucesso!</h2>
            <p className="text-sm text-gray-600">
              Os teus perfis serão entregues via WhatsApp após verificação do pagamento.
            </p>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
              <p className="mb-2">Preferes enviar o comprovativo por WhatsApp?</p>
              <a
                href="https://wa.me/244946014060"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Enviar via WhatsApp
              </a>
            </div>

            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
