interface Props {
  icon: string
  title: string
  description: string
}

export default function FeatureCard({ icon, title, description }: Props) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 hover:border-indigo-500/30 hover:bg-white/10 hover:shadow-lg hover:shadow-indigo-500/5">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-2xl transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-400">{description}</p>
    </div>
  )
}
