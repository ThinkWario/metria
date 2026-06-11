import type { AgentProfile } from '../../ai-agent/promptCompiler'

export const SOLAR_TEMPLATE: AgentProfile = {
  business: {
    description: 'Empresa de instalación de paneles solares residenciales y comerciales. Reducimos la cuenta de luz hasta un 90% con energía limpia.',
    coverage: ''
  },
  offer: [
    { name: 'Kit Solar Residencial 3kW (casa pequeña, cuenta < $80.000)', price: '' },
    { name: 'Kit Solar Residencial 5kW (casa mediana, cuenta $80.000-$150.000)', price: '' },
    { name: 'Kit Solar 10kW+ (casa grande o comercio)', price: 'cotización personalizada' }
  ],
  qualificationQuestions: [
    { key: 'monthly_bill', question: '¿Cuánto pagas aproximadamente de luz al mes?' },
    { key: 'property_type', question: '¿Es casa o departamento? ¿Cómo es el techo (losa, teja, zinc)?' },
    { key: 'is_owner', question: '¿Eres propietario/a de la vivienda?' },
    { key: 'location', question: '¿En qué comuna o ciudad está la propiedad?' },
    { key: 'financing', question: '¿Te interesa pagar al contado o con financiamiento?' }
  ],
  objections: [
    { objection: 'Es muy caro', response: 'La inversión se recupera en 4-6 años con el ahorro en la cuenta de luz, y los paneles duran más de 25 años. Además hay opciones de financiamiento desde cuotas mensuales similares a lo que hoy pagas de luz.' },
    { objection: 'No sé si mi techo sirve', response: 'Por eso la visita técnica es gratis y sin compromiso: un experto evalúa orientación, sombras y estructura, y te entrega una propuesta exacta.' },
    { objection: 'Lo voy a pensar', response: 'Perfecto. Mientras lo piensas, ¿te parece que agendemos la evaluación gratuita? No te compromete a nada y tendrás números reales para decidir.' },
    { objection: '¿Qué pasa si se echan a perder?', response: 'Los paneles tienen garantía de fabricante de 10-12 años y garantía de generación de 25 años. La instalación también queda garantizada.' }
  ],
  scheduling: { enabled: true, types: ['SITE_VISIT'] }
}
