interface Props {
  name: string
  price: number
  profiles: number
  popular?: boolean
  onSelect: () => void
}

function fmtKz(v: number) {
  return v.toLocaleString('pt') + ' Kz'
}

export default function PlanCard({ name, price, profiles, popular, onSelect }: Props) {
  return (
    <div
      className={`relative rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        popular
          ? 'border-indigo-500 bg-indigo-600/10 shadow-lg shadow-indigo-500/10'
          : 'border-white/10 bg-white/5 hover:border-indigo-500/30 hover:shadow-indigo-500/5'
      }`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-bold text-white">
          Popular
        </span>
      )}
      <p className={`text-sm font-medium ${popular ? 'text-indigo-300' : 'text-gray-400'}`}>
        {name}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-white">{fmtKz(price)}</p>
      <p className="mt-1 text-sm text-gray-500">{profiles} {profiles === 1 ? 'perfil' : 'perfis'} / mês</p>
      <button
        onClick={onSelect}
        className={`mt-5 w-full rounded-xl py-2.5 text-sm font-semibold transition cursor-pointer ${
          popular
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-white/10 text-white hover:bg-white/20'
        }`}
      >
        Escolher Plano
      </button>
    </div>
  )
}
