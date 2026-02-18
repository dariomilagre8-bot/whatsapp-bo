export default function Footer() {
  return (
    <footer id="contacto" className="border-t border-white/10 bg-gray-950/50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="text-lg font-bold text-white">
              StreamZone<span className="text-indigo-400"> Connect</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Streaming premium a preços acessíveis em Angola. Netflix e Prime Video com entrega imediata.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Links</p>
            <ul className="space-y-2 text-sm">
              <li><a href="#planos" className="text-gray-400 transition hover:text-white">Planos</a></li>
              <li><a href="#como-funciona" className="text-gray-400 transition hover:text-white">Como Funciona</a></li>
              <li><a href="#faq" className="text-gray-400 transition hover:text-white">FAQ</a></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Contacto</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://wa.me/244946014060"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 transition hover:text-green-400"
                >
                  WhatsApp: 946 014 060
                </a>
              </li>
              <li className="text-gray-500">Luanda, Angola</li>
            </ul>
          </div>

          {/* Pagamento */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Pagamento</p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>Transferência BAI</li>
              <li>Multicaixa Express</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} StreamZone Connect. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}
