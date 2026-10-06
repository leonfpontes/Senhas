/**
 * Notas de versão do GiraHub — mostradas no modal "Novidades" (menu do perfil e
 * abertura automática a cada versão nova; ver `components/admin/ReleaseNotesDialog`).
 *
 * A primeira entrada é SEMPRE a versão atual (`APP_VERSION`, do package.json) — um teste
 * garante isso. Ao subir a versão no package.json, acrescente a entrada nova no topo,
 * em linguagem de quem usa o sistema no terreiro (sem termos técnicos).
 *
 * Histórico montado em 2026-10-06 a partir das publicações no git. Só 1.0.0 (março),
 * 1.1.0 (março) e 2.0.0 (outubro) foram versões numeradas na época; as 1.2 a 1.8 agrupam
 * por mês o que foi publicado entre elas.
 */

export interface ReleaseNote {
  version: string;
  /** Data da publicação (AAAA-MM-DD) ou só o mês (AAAA-MM) para as versões agrupadas. */
  date: string;
  title: string;
  highlights: string[];
  fixes?: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2.2.0',
    date: '2026-10-07',
    title: 'Revisão completa das jornadas',
    highlights: [
      'Porta instalável no celular: abra a Porta e toque em "Instalar a Porta na tela inicial". Sem internet, a fila carregada continua na tela.',
      'Operadores com permissão só da Porta ou só de Senhas agora escolhem a gira normalmente, inclusive no modo TV.',
      'Senhas: busca na gira inteira, filtro "Não veio", exportação em CSV e senha de associado sempre como P001.',
      'Giras: "Compartilhar link" do cartão leva para a própria gira, campo "Local" opcional e aviso quando a soma das vagas por horário não bate com o total.',
      'Mensalidades: o valor pago vai para as contas a receber, a isenção pode ser marcada no cadastro do médium e do associado, e "Marcar como pago" em lote só pega quem está em aberto.',
      'Financeiro: lançamentos mensais e anuais geram o próximo ao dar baixa; dá para cancelar, estornar a baixa e reabrir; o fluxo de caixa começa pelo saldo inicial das contas.',
      'Analytics e Auditoria voltaram ao menu, com os números de cancelados corretos.',
      'Emissão pública: com horários marcados e gira lotada, dá para entrar na fila de espera; a logo do terreiro aparece; "Ver próximas giras" abre a agenda do terreiro.',
      '"Lembrar-me" no login passa a valer: desmarcado, a sessão termina ao fechar o navegador. E-mail com maiúsculas não atrapalha mais o login.',
      'Conta desativada: "Reativar e entrar" sem digitar a senha de novo.',
    ],
    fixes: [
      'Operadores com permissão de grupo deixam de receber "acesso negado" em Configurações, Pessoas, Cursos, Mensalidades e Auditoria.',
      'Lista de associados, itens e movimentações de estoque e participantes de cursos mostram todos os registros, não só os primeiros.',
      'Recadastrar um associado com o e-mail de um excluído não dá mais erro.',
      'Editar médium, associado, lançamento ou grupo de estoque agora permite apagar um campo.',
      'Meu Site não mostra mais "alterado por outro usuário" depois de publicar, e o histórico guarda versões úteis.',
      'A gira de hoje continua no Início enquanto acontece, e o gráfico dos últimos 7 dias mostra as datas certas.',
      'Cancelar senhas em lote cancela também os acompanhantes e devolve as vagas.',
      '"Reenviar meu e-mail" reenvia só a senha desta gira, igual ao e-mail original.',
      'A inscrição em curso envia o e-mail de confirmação prometido.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-10-06',
    title: 'Leitura mais fácil e ajuda no menu',
    highlights: [
      'Novidades da versão: esta janela abre quando sai uma versão nova e fica sempre no menu do seu perfil.',
      'A conversa com o suporte agora fica no menu do seu perfil, em "Falar com o suporte". O balão "Ajuda" saiu do canto da tela e não cobre mais botões nem informações.',
      'Cores revisadas no modo claro e no modo escuro: etiquetas de prioridade, de estoque e de status ficaram legíveis.',
      'A cor do seu terreiro agora é ajustada automaticamente quando aparece em texto, para continuar legível mesmo quando é uma cor clara.',
    ],
    fixes: [
      'No celular, a barra de "Alterações não salvas" e as ações em lote não ficam mais escondidas atrás da barra de navegação de baixo.',
      'No celular, o texto dos botões não sai mais para fora do botão, como no "Chamar próximo" da Porta.',
      'Janelas de confirmação com botões de texto longo (como "Continuar editando" e "Confirmar cancelamento") não cortam mais o texto.',
      'Cartões de números no celular mostram o rótulo e o valor inteiros.',
      'Números dos eixos e legendas dos gráficos ficaram legíveis nos dois modos.',
      'Nomes dos planos legíveis na página de assinatura.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-06',
    title: 'GiraHub 2.0: interface nova',
    highlights: [
      'Visual novo em todo o sistema, com menu organizado por trabalho (Hoje, Giras e senhas, Corrente, Casa) e busca rápida de páginas e ações (Ctrl K ou ⌘K).',
      'No celular, barra de navegação embaixo com Início, Giras, Porta e um botão de ações rápidas.',
      'A gira de hoje vira o contexto da tela: Início, Giras, Senhas e Porta já abrem nela.',
      'Porta em modo operação: botão "Chamar próximo", fila com menu por pessoa, "Desfazer" depois de cada ação, "Sem senha" e modo TV.',
      'Giras em cartões, com a linha do tempo das senhas, e criação de gira em 3 passos.',
      'Senhas com busca, filtros e o detalhe de cada pessoa num painel lateral.',
      'Início mostra o roteiro da primeira gira até o terreiro começar, e depois a gira de hoje e os números da casa.',
      'Editor do site do terreiro renovado, com assistente, galeria, prévia e "Publicar alterações".',
      'Páginas públicas novas: emissão de senha, bilhete, fila, cancelamento e inscrição em cursos.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-10',
    title: 'Primeiros passos guiados',
    highlights: [
      'Roteiro da primeira gira no Início para terreiros novos.',
      'No cadastro, perguntamos o que você mais precisa resolver, e o tour de boas-vindas segue esse caminho.',
      'Ao criar uma gira, a configuração das senhas abre em seguida, já com valores sugeridos.',
      'E-mails de boas-vindas no primeiro e no terceiro dia, com dicas para começar.',
      'Quando o período de teste acaba, os médiuns cadastrados continuam visíveis para consulta, e o plano em teste tem botão para assinar.',
      'Operador sem grupo de permissão não acessa nada; os operadores atuais entraram no grupo "Acesso total".',
    ],
    fixes: [
      'Ações em lote na tela de senhas voltaram a funcionar e respeitam a gira escolhida.',
      'O link "resgatar sua senha" dos e-mails abre o bilhete em vez de uma página de erro.',
      'E-mails de fim de teste e de aniversário não chegam mais repetidos.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09',
    title: 'Acompanhantes e emissão mais clara',
    highlights: [
      'Acompanhantes por gira: senhas extras, com nome, emitidas junto com a do titular.',
      'Um único endereço de emissão de senhas por terreiro, que mostra o nome e a data da gira.',
    ],
    fixes: ['A gira do dia continua no calendário do site do terreiro depois do horário de início.'],
  },
  {
    version: '1.6.0',
    date: '2026-08',
    title: 'Horários de atendimento e suporte',
    highlights: [
      'Agendamento por horário de atendimento na gira (planos Pro e Premium), com o horário no e-mail de confirmação.',
      'O consulente pode cancelar a própria senha pelo link do e-mail, e a vaga volta para a gira.',
      'Conversa com o suporte do GiraHub direto do painel.',
      'Edição da prioridade de uma senha pelo administrador.',
      'Acesso rápido à Porta a partir de Giras e do Início.',
    ],
    fixes: ['Emissão de senha não falha mais quando duas giras estão abertas ao mesmo tempo.'],
  },
  {
    version: '1.5.0',
    date: '2026-07',
    title: 'Fila de espera e teste grátis',
    highlights: [
      'Teste grátis de 1 mês no plano Premium para terreiros novos.',
      'Fila de espera quando as senhas acabam (planos Pro e Premium).',
      'Campo "Recados" na gira, enviado no e-mail da senha.',
      'Médiuns com data de entrada, de saída e tempo de casa.',
      'Desativar e reativar a conta do terreiro.',
    ],
    fixes: [
      'Cancelar uma senha devolve a vaga para a gira.',
      'Busca de CEP, mapa do "Como chegar" e PDF do relatório voltaram a funcionar.',
      'Relatório de gira lista todos os consulentes.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-06',
    title: 'Financeiro completo e grupos de permissão',
    highlights: [
      'Grupos de permissão: escolha o que cada operador pode ver, cadastrar, editar e excluir.',
      'Contas a pagar, contas a receber e fluxo de caixa, com relatório em PDF.',
      'Configuração financeira e integração das mensalidades com as contas a receber.',
      'Cursos presenciais com página de inscrição, ficha completa e pagamento por PIX.',
      'Modo escuro e nova identidade visual do painel.',
      'Busca de senhas, aviso sonoro na Porta, pagamento de mensalidades em lote, "Lembrar-me" no login e modo TV da Porta.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05',
    title: 'Fila preferencial por categoria',
    highlights: [
      'Fila preferencial por categoria de atendimento (idosos, PcD e TEA, gestantes e lactantes, mobilidade reduzida).',
      'Mensalidades dos médiuns também no plano Pro.',
    ],
    fixes: ['Datas e horários das giras no calendário e nos e-mails seguem o horário de Brasília.'],
  },
  {
    version: '1.2.0',
    date: '2026-04',
    title: 'Site do terreiro e assinatura online',
    highlights: [
      'Site do terreiro (planos Pro e Premium), com editor visual.',
      'Assinatura e troca de plano online.',
      'Mensalidades dos médiuns e associados.',
      'Relatório de gira com PDF.',
      'Guia de cada tela no botão "?".',
      'Excluir uma senha devolve a vaga para a gira.',
      'Acompanhamento dos e-mails de senha: enviado, entregue e aberto.',
      'Recuperação de senha por e-mail e aviso semanal dos aniversariantes.',
      'Exclusão definitiva da conta, conforme a LGPD.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03',
    title: 'Associados, estoque e a marca do terreiro',
    highlights: [
      'Cadastro de associados e controle de estoque.',
      'Novo Início com a visão geral do terreiro.',
      'Logo e cores do terreiro no painel e nas páginas públicas.',
      'Cadastro do terreiro pelo próprio site, no plano gratuito.',
      'Atendimento sem senha na Porta.',
      'Prioridade para associados e preferenciais na fila.',
      'Painel adaptado para celular e tablet.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-05',
    title: 'Lançamento',
    highlights: [
      'Emissão de senhas pela internet, com e-mail de confirmação para o consulente.',
      'Cadastro de giras com quantidade de senhas e horário de abertura.',
      'Porta: check-in e chamada das senhas no dia da gira.',
      'Cada terreiro com seu painel, usuários e dados separados.',
    ],
  },
];

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "6 de outubro de 2026" ou, para versões agrupadas por mês, "outubro de 2026". */
export function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS[(m ?? 1) - 1];
  return d ? `${d} de ${month} de ${y}` : `${month} de ${y}`;
}
