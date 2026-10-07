/**
 * Dúvidas frequentes da landing (V-04). Fonte única do Accordion e do JSON-LD FAQPage — o texto
 * do JSON-LD precisa ser idêntico ao visível. Cada resposta foi conferida com o código em 2026-10-06;
 * ao mudar o comportamento do produto, atualize aqui (R-02).
 */
export interface FaqItem {
  q: string;
  a: string;
}

export const LANDING_FAQ: readonly FaqItem[] = [
  {
    q: 'Preciso de cartão de crédito para testar?',
    a: 'Não. Todo terreiro novo começa com 30 dias do plano Premium, sem cartão. Se não assinar, a conta volta sozinha para o plano Gratuito no fim do teste e nada é cobrado. O teste vale uma vez por CPF/CNPJ e e-mail.',
  },
  {
    q: 'O consulente precisa instalar algum aplicativo?',
    a: 'Não. Você manda o link da gira no grupo do WhatsApp, o consulente abre no celular, preenche nome e contato e já recebe a senha. Funciona em qualquer celular com internet.',
  },
  {
    q: 'Funciona na TV do salão?',
    a: 'Sim. O Modo TV mostra em tela cheia a próxima senha e as seguintes da fila, com aviso sonoro a cada nova chamada. Basta abrir no navegador de uma Smart TV ou de um computador ligado à TV.',
  },
  {
    q: 'E se a internet cair na hora da gira?',
    a: 'A Porta pode ser instalada no celular ou tablet como aplicativo. Se a conexão cair, ela avisa na tela, continua mostrando a última fila carregada e volta a atualizar sozinha quando a internet volta. As senhas já emitidas continuam valendo.',
  },
  {
    q: 'Serve para Umbanda e para Candomblé?',
    a: 'Sim. O GiraHub foi feito para a rotina de terreiros de Umbanda, Candomblé e demais casas de axé: giras, corrente, cambones, consulentes, mensalidades e a organização da casa. Você dá o nome que a sua casa usa para cada gira.',
  },
  {
    q: 'Os dados do meu terreiro ficam seguros?',
    a: 'Os dados de cada terreiro ficam separados dos demais e só a sua equipe acessa, com permissão por função. Seguimos a LGPD e você pode pedir a exclusão a qualquer momento. Detalhes na nossa Política de Privacidade.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Pode. Não há fidelidade nem multa. Você cancela pelo painel e o plano continua ativo até o fim do período já pago.',
  },
  {
    q: 'Existe plano grátis de verdade?',
    a: 'Existe. O plano Gratuito não vence: senha pelo link do WhatsApp e Porta com a fila ao vivo para até 2 giras por mês. Quando a casa crescer, você muda de plano.',
  },
];

/** JSON-LD FAQPage gerado da mesma lista (com `<` escapado para não fechar o <script>). */
export function faqJsonLd(items: readonly FaqItem[] = LANDING_FAQ): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  }).replace(/</g, '\\u003c');
}
