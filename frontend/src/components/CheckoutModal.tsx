import { useState, useRef, type FormEvent } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

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

function fmtKz(v: number) {
  return v.toLocaleString('pt') + ' Kz'
}

const STEP_LABELS = ['Dados', 'Plano', 'Pagamento']

export default function CheckoutModal({ open, onClose }: Props) {
  const [step, setStep] = useState(1)

  // Step 1
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  // Step 2
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('')
  const [plano, setPlano] = useState('')
  const [quantidade, setQuantidade] = useState(1)

  // Step 3
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!plataforma || !selectedPlano || !file) {
      setError('Anexa o comprovativo de pagamento.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const cleanNum = '244' + whatsapp.replace(/\s/g, '')
      const res = await fetch(`${API_BASE}/api/web-checkout`, {
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

      const fd = new FormData()
      fd.append('comprovativo', file)
      fd.append('nome', nome)
      fd.append('whatsapp', cleanNum)
      fd.append('plataforma', plataforma)
      fd.append('plano', plano)
      fd.append('quantidade', String(quantidade))
      fd.append('total', String(totalPrice))

      await fetch(`${API_BASE}/api/upload-comprovativo`, { method: 'POST', body: fd })

      setStep(4)
    } catch {
      setError('Erro de conexão. Tenta novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="animate-slide-in relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-gray-900 border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Progress bar */}
        {step < 4 && (
          <div className="mb-6">
            <div className="mb-3 flex justify-between">
              {STEP_LABELS.map((label, i) => {
                const s = i + 1
                return (
                  <div key={s} className="flex flex-col items-center gap-1.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                        s < step
                          ? 'bg-green-500 text-white'
                          : s === step
                          ? 'bg-indigo-600 text-white ring-4 ring-indigo-600/20'
                          : 'bg-white/10 text-gray-500'
                      }`}
                    >
                      {s < step ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        s
                      )}
                    </div>
                    <span className={`text-[10px] font-medium ${s <= step ? 'text-white' : 'text-gray-500'}`}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
            {/* Progress track */}
            <div className="h-1 rounded-full bg-white/10">
              <div
                className="h-1 rounded-full bg-indigo-600 transition-all duration-500 ease-out"
                style={{ width: `${((step - 1) / 2) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm font-medium text-red-400">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* STEP 1: Client data */}
        {step === 1 && (
          <div className="animate-slide-in space-y-4">
            <h2 className="text-xl font-bold text-white">Dados do cliente</h2>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Nome completo</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                WhatsApp (para entrega)
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <input
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="9XX XXX XXX"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={nextStep}
              className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 cursor-pointer"
            >
              Continuar
            </button>
          </div>
        )}

        {/* STEP 2: Plan selection */}
        {step === 2 && (
          <div className="animate-slide-in space-y-4">
            <h2 className="text-xl font-bold text-white">Escolhe o teu plano</h2>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Plataforma</label>
              <select
                required
                value={plataforma}
                onChange={(e) => { setPlataforma(e.target.value as Plataforma | ''); setPlano('') }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 [&>option]:bg-gray-900"
              >
                <option value="">Selecionar plataforma</option>
                <option value="Netflix">Netflix</option>
                <option value="Prime Video">Prime Video</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Plano</label>
              <select
                required
                value={plano}
                onChange={(e) => setPlano(e.target.value)}
                disabled={!plataforma}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-40 [&>option]:bg-gray-900"
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
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Quantidade</label>
              <input
                type="number"
                required
                min={1}
                max={5}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.min(5, Math.max(1, Number(e.target.value))))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {selectedPlano && (
              <div className="rounded-xl bg-indigo-600/10 border border-indigo-500/20 p-4 text-center">
                <p className="text-sm text-indigo-300">Total a pagar</p>
                <p className="text-2xl font-bold text-white">{fmtKz(totalPrice)}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setError(''); setStep(1) }}
                className="flex-1 rounded-xl border border-white/10 py-3 font-semibold text-gray-300 transition hover:bg-white/5 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Payment + Upload */}
        {step === 3 && (
          <form onSubmit={handleSubmit} className="animate-slide-in space-y-4">
            <h2 className="text-xl font-bold text-white">Pagamento</h2>

            {/* Order summary */}
            {selectedPlano && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Cliente</span>
                  <span className="font-medium text-white">{nome}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Plano</span>
                  <span className="font-medium text-white">{plataforma} {selectedPlano.label.split('—')[0].trim()}</span>
                </div>
                {quantidade > 1 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Quantidade</span>
                    <span className="font-medium text-white">{quantidade}x</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-300">Total</span>
                  <span className="text-lg font-bold text-indigo-400">{fmtKz(totalPrice)}</span>
                </div>
              </div>
            )}

            {/* Bank details */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3 text-sm">
              <p className="font-semibold text-white">Coordenadas bancárias</p>
              <div>
                <p className="font-medium text-gray-300">BAI</p>
                <p className="font-mono text-xs text-gray-400">IBAN: 0040.0000.7685.3192.1018.3</p>
                <p className="text-gray-400">Titular: Braulio Manuel</p>
              </div>
              <div>
                <p className="font-medium text-gray-300">Multicaixa Express</p>
                <p className="font-mono text-xs text-gray-400">946014060</p>
              </div>
            </div>

            {/* Warning */}
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 space-y-1">
              <p>O pacote adquirido não pode ser revertido após confirmação.</p>
              <p>O comprovativo deve ser em formato PDF ou imagem (JPG/PNG).</p>
            </div>

            {/* File upload */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Comprovativo de pagamento</label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
                  file
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-white/10 bg-white/5 hover:border-indigo-500/30'
                }`}
              >
                {file ? (
                  <>
                    <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-green-400">{file.name}</p>
                    <p className="text-xs text-gray-500">Clica para alterar</p>
                  </>
                ) : (
                  <>
                    <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-400">Clica para enviar o comprovativo</p>
                    <p className="text-xs text-gray-500">PDF, JPG ou PNG (máx. 5MB)</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
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
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setError(''); setStep(2) }}
                className="flex-1 rounded-xl border border-white/10 py-3 font-semibold text-gray-300 transition hover:bg-white/5 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    A processar...
                  </span>
                ) : (
                  'Enviar Pedido'
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: Success */}
        {step === 4 && (
          <div className="animate-slide-in space-y-5 py-4 text-center">
            {/* Animated checkmark */}
            <div className="flex justify-center">
              <svg className="checkmark-svg h-20 w-20" viewBox="0 0 52 52" fill="none">
                <circle className="checkmark-circle" cx="26" cy="26" r="25" stroke="#22c55e" strokeWidth="2" fill="none" />
                <path className="checkmark-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div>
              <h2 className="text-xl font-bold text-white">Pedido registado!</h2>
              <p className="mt-2 text-sm text-gray-400">
                Os teus perfis serão entregues via WhatsApp após verificação do pagamento.
              </p>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2 text-sm text-left">
              <p className="font-semibold text-gray-300 text-center mb-3">Resumo do Pedido</p>
              <div className="flex justify-between">
                <span className="text-gray-400">Nome</span>
                <span className="text-white">{nome}</span>
              </div>
              {plataforma && selectedPlano && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Plano</span>
                  <span className="text-white">{plataforma} — {selectedPlano.label.split('—')[0].trim()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Total</span>
                <span className="font-bold text-indigo-400">{fmtKz(totalPrice)}</span>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
              <p className="mb-3">Preferes enviar o comprovativo por WhatsApp?</p>
              <a
                href="https://wa.me/244946014060"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-500"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Enviar via WhatsApp
              </a>
            </div>

            <button
              onClick={handleClose}
              className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
