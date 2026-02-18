import { useState } from 'react'

const faqs = [
  {
    question: 'Como recebo os perfis?',
    answer: 'Após confirmação do pagamento, os perfis são entregues diretamente via WhatsApp. Receberás as credenciais de acesso no teu número.',
  },
  {
    question: 'Quanto tempo demora a entrega?',
    answer: 'A entrega é imediata após verificação do comprovativo de pagamento. Na maioria dos casos, recebes em menos de 30 minutos.',
  },
  {
    question: 'Posso partilhar com amigos?',
    answer: 'Sim! Os planos Partilha (2 perfis) e Família (3 perfis) foram criados exactamente para isso. Cada pessoa recebe o seu próprio perfil.',
  },
  {
    question: 'Quais são os métodos de pagamento?',
    answer: 'Aceitamos transferência bancária BAI e Multicaixa Express. As coordenadas são apresentadas no momento do checkout.',
  },
  {
    question: 'E se tiver problemas com o perfil?',
    answer: 'Tens suporte via WhatsApp 24/7. A nossa equipa resolve qualquer problema rapidamente.',
  },
  {
    question: 'Posso trocar de plano depois?',
    answer: 'Sim, basta contactar-nos via WhatsApp. Ajudamos-te a fazer upgrade ou mudança de plano.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Perguntas Frequentes</h2>
        <p className="mt-3 text-gray-400">Tudo o que precisas saber antes de começar</p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden transition-colors hover:border-white/20"
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="flex w-full items-center justify-between px-5 py-4 text-left cursor-pointer"
            >
              <span className="pr-4 text-sm font-semibold text-white sm:text-base">{faq.question}</span>
              <span
                className={`flex-shrink-0 text-xl text-indigo-400 transition-transform duration-300 ${
                  openIndex === i ? 'rotate-45' : ''
                }`}
              >
                +
              </span>
            </button>
            <div
              className={`transition-all duration-300 ease-in-out ${
                openIndex === i ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="px-5 pb-4 text-sm leading-relaxed text-gray-400">{faq.answer}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
