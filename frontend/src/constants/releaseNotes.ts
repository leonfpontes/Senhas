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
    version: '3.0.0',
    date: '2026-11-07',
    title: 'GiraHub de cara nova: menu enxuto e tudo a um clique',
    highlights: [
      'O painel ganhou cara nova, com as cores da casa. Nada saiu do lugar sem deixar caminho: toda tela que existia continua lá, com o mesmo endereço.',
      'O menu lateral ficou enxuto. Em cima, sempre, o dia de gira: Início, Giras, Porta e Senhas. Embaixo, em "Da casa", os módulos que a casa usa. Os outros estão em "Ver os módulos", no fim do menu, com o plano de cada um.',
      'Para achar qualquer tela ou ação, use a busca no alto da tela (ou as teclas Ctrl K). Digite "fluxo", "médiuns" ou "nova gira" e vá direto.',
      'Plano e assinatura, Pessoas e acessos, Perfis de acesso (o antigo "Grupos de permissão"), Configurações, Auditoria e Ajuda agora ficam no menu do seu nome: o círculo com a sua inicial, no alto à direita. No celular, no fim do Menu.',
      'A configuração da Área do Médium fica em Configurações › Área do Médium.',
      'Para editar uma gira, um médium, um lançamento ou qualquer item de lista, é só clicar ou tocar nele: a edição abre na hora, sem procurar o lápis. Excluir, arquivar e as outras ações continuam nos seus botões.',
      'No site do GiraHub, quem já está logado vê "Abrir o <nome do terreiro>" para voltar ao painel, e o "Sair" fica à vista. Quem tem mais de um terreiro escolhe onde entrar.',
      'A página onde o consulente pega a senha e o bilhete ganharam cara nova, com o selo de atendimento preferencial e os acompanhantes no bilhete.',
      'Porta e Modo TV ficaram mais leves em iPad e celular antigos, e a janela de chamar cabe em tela pequena com o teclado aberto.',
    ],
  },
  {
    version: '2.11.0',
    date: '2026-10-29',
    title: 'Avisos para médiuns escolhidos, lista do que repor e mais',
    highlights: [
      'Avisos da Área do Médium agora podem ir para médiuns escolhidos um a um: em Avisos, escolha "Médiuns específicos" e marque quem deve receber. Só eles veem o aviso e recebem o e-mail, e o "lido por" conta só os escolhidos.',
      'Em Estoque → Itens, o botão "PDF para repor" gera um PDF com os itens que acabaram (zerados ou negativos) e os que estão abaixo do mínimo, com saldo, mínimo, quanto falta e quanto custa repor. Com um grupo escolhido no filtro, o PDF sai só com aquele grupo.',
      'O PDF do Fluxo de caixa agora traz, depois do resumo, cada lançamento recebido e pago de cada mês, com data, descrição, categoria, conta e valor. É o detalhamento que o contador pede.',
      'Mensalidades mudou de lugar no menu: agora fica dentro de Financeiro.',
      'Na lista de senhas e no detalhe da senha, quem deixou e-mail ganha um botão de enviar e-mail, ao lado de ligar e WhatsApp.',
    ],
    fixes: [
      'O PIX copia e cola e o QR da mensalidade eram recusados por alguns bancos. O código foi simplificado para o app do banco aceitar.',
    ],
  },
  {
    version: '2.10.0',
    date: '2026-10-26',
    title: 'Mensalidade em mais de uma conta',
    highlights: [
      'A casa que recebe a mensalidade em mais de uma conta agora pode ter uma chave PIX para cada grupo da corrente. Em Financeiro → Configuração → Mensalidade, cadastre a outra chave e escolha os grupos que pagam nela. Quem não está nesses grupos continua pagando na chave do terreiro.',
      'Cada chave diz em qual conta bancária o dinheiro cai. A mensalidade paga entra no saldo dessa conta.',
      'O Fluxo de caixa ganhou o filtro por conta: veja o saldo de cada conta separado ou de todas juntas.',
      'Na Área do Médium, cada um vê a chave do seu grupo, no PIX copia e cola e no QR.',
    ],
    fixes: [
      'Mensalidades pagas antes desta versão não têm conta definida. Elas continuam no total de "Todas as contas".',
    ],
  },
  {
    version: '2.9.0',
    date: '2026-10-26',
    title: 'Financeiro por categoria',
    highlights: [
      'Nova tela Financeiro → Por categoria: quanto entrou e quanto saiu em cada categoria no período, com gráfico, percentual de cada uma e o que ainda está em aberto. Período de mais de um mês mostra também o valor de cada mês.',
      'Relatório por categoria em PDF, com a logo do terreiro, e exportação em CSV para abrir no Excel.',
      'Botão "Por categoria" no Fluxo de caixa e em Lançamentos, já no mesmo período.',
    ],
  },
  {
    version: '2.8.3',
    date: '2026-10-26',
    title: 'Saldo do fluxo de caixa batendo com o banco',
    highlights: [
      'Cada conta bancária agora tem a data do saldo inicial ("Saldo em"). O Fluxo de caixa parte desse saldo e só soma o que foi pago a partir dessa data. Mensalidades e lançamentos mais antigos já estão dentro do saldo informado e não contam de novo.',
      'A tabela do Fluxo de caixa ganhou a coluna "Saldo anterior": o quanto o mês começou, que é o que sobrou do mês anterior.',
      'Estoque ganhou o item "Grupos" no menu e um botão "Grupos" na tela de Itens, para criar grupos como Velas e Bebidas.',
    ],
    fixes: [
      'As contas já cadastradas ficam com a data em que foram criadas. Se o saldo informado era de outro dia, é só editar a conta em Configuração financeira → Contas bancárias e ajustar o "Saldo em".',
    ],
  },
  {
    version: '2.8.2',
    date: '2026-10-23',
    title: 'Painel ou Área do Médium: você escolhe ao entrar',
    highlights: [
      'Quem cuida do painel do terreiro e também é médium da casa agora escolhe, a cada vez que entra, se vai para o Painel do terreiro ou para a Área do Médium. Antes, quem tinha passado pela Área uma vez continuava caindo direto nela.',
    ],
  },
  {
    version: '2.8.1',
    date: '2026-10-22',
    title: 'Prazo da fila de espera em horas e minutos',
    highlights: [
      'O prazo para quem está na fila de espera confirmar a vaga agora aceita horas e minutos (ex.: 00:45, 01:30, 02:15), no formato hh:mm. Fica nas senhas da gira, em "Fila de espera".',
      'O e-mail que avisa da vaga mostra o prazo do jeito certo: "Confirme em até 1h30" ou "em até 45 min".',
    ],
  },
  {
    version: '2.8.0',
    date: '2026-10-20',
    title: 'Duplas da noite na Porta',
    highlights: [
      'Na Porta, o porteiro monta as duplas da noite: marca quais médiuns estão trabalhando e escolhe o cambone de cada um. Na hora de chamar uma senha, é só tocar no médium: o cambone já vem preenchido.',
      'Cada médium aparece com quantas senhas já atendeu na noite, para ajudar a distribuir os atendimentos.',
      'Para montar mais rápido: "Copiar da última gira" e sugestões de cambone pelo histórico dos atendimentos. Um cambone fica com um médium por vez.',
      'Nas casas do teste da Área do Médium, quem confirmou presença na gira já aparece no topo da lista.',
      'Nova opção em Configurações: mostrar no Modo TV o nome do médium que vai atender a senha chamada (vem desligada).',
    ],
  },
  {
    version: '2.7.0',
    date: '2026-10-09',
    title: 'PIX na assinatura, mensalidade automática e troca de terreiro',
    highlights: [
      'Assinatura do plano no PIX, mês a mês: cada PIX pago libera 30 dias, e o GiraHub avisa antes de vencer. Prefere boleto? Também dá, com a fatura chegando todo mês.',
      'Casas que conectam a conta do Mercado Pago: a mensalidade que o médium paga pelo PIX na Área do Médium aparece como "Paga" sozinha, sem ninguém precisar conferir comprovante. Plano Pro, nas casas do teste da Área.',
      'Pagamento parcial da mensalidade: a direção confere quanto chegou, o médium vê "Falta pagar R$ X" e o PIX já sai no valor que falta. Dá para mandar vários comprovantes no mesmo mês, sem um apagar o outro.',
      'Tem acesso a mais de um terreiro? Agora dá para trocar de casa pelo menu do perfil, sem sair da conta.',
      'Programa de Parceiros do GiraHub: quem indica casas pode conhecer o programa em girahub.com.br/parceiros.',
      'Nas casas do teste da Área do Médium: os lembretes (véspera da gira, mensalidade, escala nova, avisos da casa) também podem chegar como notificação no celular. Cada médium liga ou desliga no próprio aparelho.',
    ],
    fixes: [
      'As caixas de texto grandes dos formulários (por exemplo, na inscrição em curso) não acusam mais "campo obrigatório" quando já estão preenchidas.',
      'O relatório da gira não fica mais em branco quando a casa não marca os atendimentos como concluídos.',
      'O seletor de gira não aparece mais repetido no topo das telas da Porta e de Senhas.',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-10-08',
    title: 'Ficha espiritual, estudos e troca na escala',
    highlights: [
      'Ficha espiritual do médium no painel: campos por tradição (modelos de Umbanda e de Candomblé), linha do tempo da caminhada e autorização do próprio médium antes de guardar qualquer dado. Só quem a casa liberar vê a ficha. Plano Pro.',
      'Abrindo uma casa nova com um e-mail que já tem conta no GiraHub? Agora dá: é só usar a mesma senha, e no login você escolhe em qual terreiro entrar.',
      'A Área do Médium ficou clara, no tom do site, com a cor e a logo da casa nos detalhes.',
      'Nas casas do teste da Área: troca na escala entre médiuns (o colega aceita e a direção aprova) e a direção pode aceitar ou recusar o motivo de uma falta.',
      'Também nas casas do teste: estudos e documentos da casa (links, textos e pontos cantados para cada público, e os cursos abertos), "Minha caminhada" para o médium, aniversariantes da semana para quem quiser aparecer e "Meus dados", para baixar os próprios dados ou encerrar o acesso.',
    ],
    fixes: [
      'Política de Privacidade atualizada (versão 2.3) com a ficha espiritual e o "Meus dados" da Área.',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-10-08',
    title: 'Escalas, presença e lembretes',
    highlights: [
      'Tem conta em mais de um terreiro com o mesmo e-mail? Agora, ao entrar, você escolhe em qual casa quer entrar.',
      'Nas casas do teste da Área do Médium: grupos da corrente (para mandar avisos e montar escalas por grupo) e atividades da casa na agenda — faxina, rituais, reuniões e desenvolvimento.',
      'Presença da corrente: o médium responde "Vou" ou "Não vou", marca "Cheguei" pelo QR do dia e a casa faz a chamada pelo painel. O relatório de assiduidade mostra a frequência por médium e por grupo, com PDF.',
      'Escala de gira por função (Cambone, Ogã, Porteiro...): monte com médiuns um a um ou com o grupo inteiro, copie da gira anterior ou faça o rodízio das próximas giras. E a escala de faxina do mês, por grupos e dias.',
      'Lembretes por e-mail: véspera da gira, mensalidade perto de vencer e escala nova. Cada médium escolhe no Perfil quais quer receber.',
      'Perfil do médium: dados, foto, troca de e-mail e de senha, direto no celular. A Área do Médium segue em teste com algumas casas e será liberada para todas em breve.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-10-07',
    title: 'Área do Médium chegando',
    highlights: [
      'Vem aí a Área do Médium: um espaço da corrente no celular de cada médium, com a agenda das giras, os avisos da casa e a mensalidade pelo PIX. Ela começa em teste com algumas casas e será liberada para todas em breve.',
      'Nas casas do teste: convite dos médiuns pela tela Médiuns, com a mensagem pronta para mandar no WhatsApp; avisos para a corrente, com a lista de quem leu e de quem ainda não leu; e conferência dos comprovantes de mensalidade enviados pelos próprios médiuns.',
      'Também nas casas do teste: campo "Orientações para a corrente" na gira (o que levar, horário de chegada), que só a corrente vê, e chave PIX da casa nas configurações do Financeiro.',
      'Política de Privacidade atualizada (versão 2.2) com as regras da Área do Médium.',
    ],
    fixes: [
      'Quem é removido na tela Usuários perde o acesso na hora, sem esperar a sessão vencer.',
      'Desativar um operador que também é médium tira só o acesso ao painel; ele continua com a Área do Médium.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-10-07',
    title: 'Privacidade de cara nova',
    highlights: [
      'Termos de Uso e Política de Privacidade reescritos em linguagem direta, com um resumo "em poucas palavras" no começo e índice para pular direto ao assunto.',
      'Nova Política de Cookies e um aviso de cookies em todo o site: os consulentes da sua casa escolhem o que aceitam, e recusar é tão fácil quanto aceitar.',
      'Mudou de ideia? "Preferências de cookies" no rodapé do site reabre as opções a qualquer momento.',
    ],
  },
  {
    version: '2.2.1',
    date: '2026-10-07',
    title: 'Listagem de senhas em PDF',
    highlights: [
      'Senhas: o botão "Exportar CSV" virou "Exportar PDF" — baixa a listagem completa da gira, com a logo do terreiro, nome, telefone, prioridade, status, médium, cambone e observações.',
    ],
    fixes: [
      'Relatório da gira em PDF: os nomes não saem mais cortados na tabela de senhas, e cabem mais senhas por página.',
      'Ao pegar a senha, o nome digitado passa a valer, mesmo que o e-mail já tenha sido usado antes com outro nome.',
      'Pedir senha preferencial com um e-mail que já tem senha de outra pessoa não passa mais a preferência para a senha errada — o sistema pede o e-mail da própria pessoa.',
    ],
  },
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

/**
 * Notas da versão das betas do Laboratório (Configurações › Laboratório › "Nota da versão" e
 * "Notas da versão · Beta testers"). Uma por beta do catálogo (`backend/src/services/laboratorio.py`;
 * um teste confere). Linguagem de quem usa o terreiro: o que faz, como usar, quem vê e o que acontece
 * ao desligar. A documentação técnica fica em `docs/betas/`.
 */
export interface BetaReleaseNote {
  chave: string;
  /** Desde quando a beta está no Laboratório (AAAA-MM-DD). */
  date: string;
  title: string;
  /** Uma frase de resumo (lista das notas de beta testers). */
  text: string;
  /** O que a funcionalidade faz, em poucas frases. */
  oQueFaz: string;
  /** Passo a passo para usar. */
  comoUsar: string[];
  /** Quem enxerga e quem pode mexer. */
  quemVe: string;
  /** O que acontece ao desligar (sempre: nada do que foi registrado se perde). */
  aoDesligar: string;
  /** Detalhes que evitam surpresa. */
  bomSaber?: string[];
}

export const BETA_RELEASE_NOTES: BetaReleaseNote[] = [
  {
    chave: 'beta_area_medium',
    date: '2026-11-19',
    title: 'Área do Médium',
    text: 'Cada médium da corrente entra com o próprio login e vê a agenda, os avisos, as escalas e a mensalidade dele.',
    oQueFaz: 'Cada médium da corrente ganha um lugar só dele no GiraHub, com login e senha próprios. Lá ele vê a agenda das giras e das atividades da casa, os avisos e os estudos que a direção publica, as escalas em que está e a própria mensalidade, com o PIX da casa e o envio do comprovante. A casa escolhe o que aparece.',
    comoUsar: [
      'Ligue aqui. Logo aparece a aba Área do Médium em Configurações.',
      'Nessa aba, escolha o que o médium vê (agenda, avisos, mensalidade) e escreva a mensagem de boas-vindas e o WhatsApp da casa.',
      'Em Médiuns, use "Convidar todos para a Área" ou convide um por um no cadastro. Cada médium recebe um link no e-mail, cria a senha e entra.',
      'Avisos, estudos, atividades e escalas continuam sendo feitos nos módulos de sempre. O médium vê tudo na Área dele.',
    ],
    quemVe: 'Quem cuida das Configurações liga e desliga. Os médiuns convidados veem só a própria Área: não entram no painel da casa e não veem dado de outro médium. Precisa do plano Basic ou superior.',
    aoDesligar: 'Os médiuns deixam de entrar na Área na mesma hora, a aba some das Configurações e os e-mails de lembrete da Área param. Nada é apagado: convites, contas dos médiuns, avisos, escalas e configurações ficam guardados e voltam como estavam quando a casa ligar de novo.',
    bomSaber: [
      'Para pausar a Área por uns dias sem mexer no Laboratório, use "Área do Médium ligada" dentro da própria aba.',
      'Quem já usava a Área antes do Laboratório continua com ela ligada. Nada mudou para essas casas.',
    ],
  },
  {
    chave: 'beta_textos_ia_site',
    date: '2026-11-17',
    title: 'Textos do site com IA',
    text: 'No estúdio do site, peça sugestões para títulos e textos e escolha uma ou nenhuma.',
    oQueFaz: 'No estúdio do site, a IA ajuda a escrever títulos e textos. Ela escreve a partir da sua ideia, melhora o que já está escrito, encurta ou deixa mais acolhedor. Vêm até três sugestões, e você escolhe uma ou nenhuma.',
    comoUsar: [
      'Ligue também o "Novo construtor do site": a ajuda da IA fica dentro dele.',
      'No Meu Site, clique na seção que quer mudar. No painel da direita, na aba Conteúdo, abra "Escrever com ajuda da IA".',
      'Escolha qual texto (título, subtítulo, Sobre, introdução) e o que fazer. Se quiser, conte em poucas palavras o que deseja dizer.',
      'Toque em "Usar este texto" na sugestão que servir. Ela entra como uma edição comum: dá para mexer e desfazer (Ctrl+Z). O público só vê depois que você publicar.',
    ],
    quemVe: 'Quem pode editar o site da casa. A IA recebe só o nome da casa e o que já está escrito no site. Não vai e-mail, telefone nem dado de consulente ou médium.',
    aoDesligar: 'O cartão da IA some do estúdio. Os textos que você já aplicou continuam no site.',
    bomSaber: [
      'A IA não escreve sobre entidades, Orixás, guias, linhas, fundamentos ou rituais. Essas palavras são da casa, e a seção Linhas de trabalho fica de fora.',
      'Ela não inventa datas, horários, endereço nem história. O que for fato, confira antes de publicar.',
      'Cada casa pode fazer até 150 pedidos por dia.',
    ],
  },
  {
    chave: 'beta_novo_construtor_site',
    date: '2026-11-17',
    title: 'Novo construtor do site',
    text: 'O Meu Site vira um estúdio em tela cheia: edite clicando no site e veja no celular antes de publicar.',
    oQueFaz: 'O Meu Site vira um estúdio em tela cheia. Você edita o site clicando direto nele, arruma as seções, troca cores e fontes e vê como fica no computador, no tablet e no celular antes de publicar.',
    comoUsar: [
      'Abra Meu Site. Com o site vazio, escolha um caminho: responder algumas perguntas, partir de um modelo pronto ou começar do zero.',
      'Clique num texto do site para mudar. Clique numa seção para abrir o painel dela à direita, com o que aparece, o conteúdo e o estilo.',
      'Na barra da esquerda ficam Seções (arrastar para mudar a ordem, ocultar, duplicar), Adicionar (blocos prontos, é só clicar ou arrastar para o ponto do site), Estilo (cores e fontes do site todo), Passos (o que ainda falta), Ajustes e Histórico.',
      'Errou? Desfazer e refazer ficam no alto (Ctrl+Z). "Publicar" confere o que falta e mostra como o link aparece no Google e no WhatsApp.',
    ],
    quemVe: 'Quem cuida do site da casa. O público continua vendo só o site publicado.',
    aoDesligar: 'O Meu Site volta ao editor de antes. Nada se perde: o site publicado continua no ar, e as seções novas seguem aparecendo e podem ser editadas no editor antigo.',
    bomSaber: [
      'No celular, o site ocupa a tela e as ferramentas ficam numa barra embaixo.',
      'Sair pelo botão "Painel" salva o rascunho. Se o site está no ar com mudanças não publicadas, o estúdio pergunta antes de descartar.',
    ],
  },
  {
    chave: 'beta_retorno_consulente',
    date: '2026-11-06',
    title: 'Retorno do consulente na porta',
    text: 'Quem chama a senha anota que a pessoa precisa voltar, e a Porta lembra nas giras seguintes.',
    oQueFaz: 'Quando o médium ou a entidade pede que a pessoa volte, quem está na porta anota. Nas giras seguintes, a senha dessa pessoa aparece com o selo Retorno, e a casa sabe com quem encaminhar.',
    comoUsar: [
      'Na Porta, ao chamar ou editar o atendimento de uma senha, marque "Precisa voltar" e diga com qual médium e/ou entidade. Se quiser, deixe um recado.',
      'Nas próximas giras, quando a pessoa pegar senha de novo, a senha dela aparece com o selo Retorno na fila, no "Próximo" e no "Chamar". Toque no selo para ver com quem ela volta, de qual gira veio e o recado.',
      'Depois do atendimento, toque em "Marcar como resolvido". Se errar, o aviso na tela tem "Desfazer".',
    ],
    quemVe: 'Quem tem acesso à Porta vê o selo. Anotar e marcar como resolvido pede permissão de editar a Porta. O selo nunca aparece no Modo TV nem para o consulente.',
    aoDesligar: 'O selo e o campo somem da Porta. Os retornos já anotados ficam guardados e voltam quando a casa ligar de novo.',
    bomSaber: [
      'A casa reconhece a pessoa pelo mesmo cadastro, e-mail ou telefone, mesmo que numa gira ela tenha vindo pelo link e na outra sem senha.',
    ],
  },
  {
    chave: 'beta_receber_senha_de_novo',
    date: '2026-11-02',
    title: 'Receber a senha de novo',
    text: 'O consulente pede o bilhete de novo no link da gira, e ele chega só no e-mail.',
    oQueFaz: 'Quem perdeu ou apagou o e-mail da senha pede de novo, sozinho, no link da gira. Ninguém da casa precisa procurar a senha no WhatsApp em dia de gira.',
    comoUsar: [
      'Basta ligar.',
      'No link da gira aparece "Já pegou? Receber a senha de novo". A pessoa digita o e-mail que usou e o bilhete chega de novo nesse e-mail.',
    ],
    quemVe: 'O consulente, na página da gira, enquanto as senhas estão abertas ou esgotadas.',
    aoDesligar: 'O link some da página da gira. As senhas já emitidas não mudam.',
    bomSaber: [
      'Por segurança, o bilhete só vai para o e-mail que pegou a senha, e a tela não diz se aquele e-mail tem ou não senha na gira.',
    ],
  },
  {
    chave: 'beta_bilhete_offline',
    date: '2026-11-02',
    title: 'Bilhete sem internet',
    text: 'O bilhete fica guardado no celular e abre no portão sem sinal.',
    oQueFaz: 'Depois de pegar a senha, o bilhete fica guardado no celular da pessoa. Se ela chegar no portão sem sinal ou sem internet, o número aparece do mesmo jeito.',
    comoUsar: [
      'Basta ligar. Ao pegar a senha, a pessoa vê "Esta senha fica guardada neste celular e abre até sem internet".',
      'Sem sinal, ela abre o GiraHub no mesmo celular e no mesmo navegador, e a senha guardada aparece.',
    ],
    quemVe: 'O consulente, no celular em que pegou a senha. O bilhete fica só no aparelho dele, e nada novo vai para o servidor.',
    aoDesligar: 'As senhas novas deixam de ser guardadas no celular. As que já estavam guardadas somem sozinhas quando a gira passa.',
    bomSaber: [
      'O celular guarda até 5 bilhetes, só de giras que ainda não passaram.',
    ],
  },
  {
    chave: 'beta_senha_para_outra_pessoa',
    date: '2026-11-02',
    title: 'Senha para outra pessoa',
    text: 'Quem preenche pega a senha de quem vai, e a senha chega no e-mail de quem preencheu.',
    oQueFaz: 'Um filho pode pegar a senha para a mãe, e um vizinho para quem não tem celular. Quem preenche põe o nome de quem vai, e a senha chega no e-mail de quem preencheu.',
    comoUsar: [
      'No formulário da gira aparece "Para quem é a senha?", com "Para mim" já escolhido e "Para outra pessoa".',
      'Em "Para outra pessoa", o nome é o de quem vai (é o nome chamado na porta) e o e-mail é o de quem está preenchendo.',
      'A senha chega nesse e-mail. É só mostrar ou encaminhar para quem vai.',
    ],
    quemVe: 'O consulente, no link da gira.',
    aoDesligar: 'A pergunta some do formulário. As senhas já tiradas para outra pessoa continuam valendo.',
    bomSaber: [
      'O limite de senhas por e-mail é o mesmo que a casa já configurou na gira.',
    ],
  },
  {
    chave: 'beta_repetir_gira',
    date: '2026-11-02',
    title: 'Repetir a gira em outra data',
    text: 'Cria a próxima gira a partir de uma que já existe, sem preencher tudo de novo.',
    oQueFaz: 'Para a gira que se repete toda semana ou todo mês, você cria a próxima a partir de uma que já existe, sem preencher tudo de novo.',
    comoUsar: [
      'Em Giras, no cartão da gira, abra "Mais ações" e escolha "Repetir em outra data".',
      'O cadastro abre já preenchido com o nome, a descrição, os recados, o local, as orientações da corrente, a quantidade de senhas e os acompanhantes.',
      'Escolha a nova data e o horário, confira e salve.',
    ],
    quemVe: 'Quem pode criar giras.',
    aoDesligar: 'A opção some do menu da gira. As giras criadas assim continuam normais.',
    bomSaber: [
      'Só a configuração é copiada. Senhas, fila e atendimentos da gira antiga não vão para a nova.',
      'Os horários de atendimento por faixa não são copiados. Se a gira usa, configure de novo.',
    ],
  },
  {
    chave: 'beta_cartaz_portao',
    date: '2026-11-02',
    title: 'Cartaz do portão',
    text: 'PDF com o QR do link do terreiro, para imprimir e colar no portão.',
    oQueFaz: 'Um cartaz pronto para imprimir e colar no portão ou no mural, com o nome da casa e o QR do link do terreiro. Quem chega aponta a câmera do celular e pega a senha.',
    comoUsar: [
      'Abra o compartilhar do link, na gira ou no link do terreiro.',
      'Aparece a prévia do cartaz. Toque em "Baixar o cartaz (PDF)".',
      'Imprima numa folha A4 e cole no portão.',
    ],
    quemVe: 'Quem pode compartilhar o link das giras.',
    aoDesligar: 'Volta o QR simples de antes. Os cartazes já impressos continuam funcionando.',
    bomSaber: [
      'O QR é do link do terreiro, que sempre abre a próxima gira com senhas abertas. O mesmo cartaz serve para todas as giras.',
    ],
  },
  {
    chave: 'beta_lembrete_dia_gira',
    date: '2026-11-02',
    title: 'Lembrete no dia da gira',
    text: 'Um e-mail pela manhã para quem tem senha, com o número e o horário da gira.',
    oQueFaz: 'No dia da gira, de manhã, quem tem senha recebe um e-mail com o número da senha, o horário e o recado da casa. Quem não puder ir libera a vaga pelo próprio e-mail, e ela fica para outra pessoa.',
    comoUsar: [
      'Basta ligar. O envio é automático, a partir das 8h (horário de Brasília) do dia da gira.',
      'O que estiver em "Recados" no cadastro da gira vai junto no lembrete.',
    ],
    quemVe: 'Quem tem senha emitida para a gira. Cada pessoa recebe um e-mail só.',
    aoDesligar: 'Os lembretes param a partir do próximo envio. Nada muda nas senhas.',
    bomSaber: [
      'Gira que começa em menos de 2 horas não recebe lembrete.',
      'Acompanhante não recebe e-mail próprio: o lembrete vai para quem pegou a senha.',
    ],
  },
  {
    chave: 'beta_avisar_exclusao_gira',
    date: '2026-11-02',
    title: 'Avisar quem tem senha quando a gira é excluída',
    text: 'Ao excluir uma gira com senhas, a casa escolhe se manda um e-mail para quem já pegou senha.',
    oQueFaz: 'Se a casa precisar cancelar uma gira que já tem senhas, pode avisar por e-mail, de uma vez, todo mundo que pegou senha.',
    comoUsar: [
      'Em Giras, exclua a gira como sempre.',
      'Se ela tem senhas, depois de confirmar aparece a pergunta "Avisar por e-mail as pessoas que têm senha?", com "Enviar aviso" e "Não enviar".',
      'A gira é excluída nos dois casos. Fechar a pergunta sem escolher não exclui nada.',
    ],
    quemVe: 'Quem pode excluir giras. O e-mail vai para quem tinha senha.',
    aoDesligar: 'A pergunta some, e excluir volta a ser só a confirmação de sempre, sem aviso.',
    bomSaber: [
      'Nada vem marcado: a casa escolhe a cada vez se manda ou não.',
    ],
  },
  {
    chave: 'beta_menu_ajustavel',
    date: '2026-11-02',
    title: 'Menu que se ajusta ao uso',
    text: 'O que a casa já usa sobe para o menu, em "Da casa"; cada pessoa põe ou tira módulos na página Módulos.',
    oQueFaz: 'O menu lateral mostra o que a casa usa de verdade. Módulo que já tem dado (médiuns, mensalidades, estoque e outros) sobe sozinho para "Da casa", e o resto fica em "Ver os módulos".',
    comoUsar: [
      'Ligue e veja o menu se arrumar pelo uso.',
      'Na página Módulos, cada pessoa põe ou tira módulos do próprio menu.',
    ],
    quemVe: 'Todo mundo do painel da casa. O que cada pessoa escolhe na página Módulos vale só para ela.',
    aoDesligar: 'O menu volta a mostrar todos os módulos. Nada é apagado.',
    bomSaber: [
      'Nada some de verdade: o que não está no menu continua em "Ver os módulos", com o mesmo endereço.',
    ],
  },
  {
    chave: 'beta_indicacao_plano',
    date: '2026-11-02',
    title: 'Indicação do plano pelo uso',
    text: 'Em Conta e plano, uma frase com o uso do mês diz qual plano dá conta.',
    oQueFaz: 'Em Conta e plano, uma frase mostra o uso do mês, com quantas giras a casa fez e quantos médiuns cadastrou, e diz qual plano dá conta desse uso. Ajuda a não pagar a mais e a não ficar sem espaço.',
    comoUsar: [
      'Basta ligar e abrir Conta e plano › Plano e assinatura.',
    ],
    quemVe: 'Quem vê Conta e plano.',
    aoDesligar: 'A frase some. Nada muda no plano nem na cobrança.',
    bomSaber: [
      'É só uma indicação. O plano só muda se a casa escolher mudar.',
    ],
  },
];

/** "6 de outubro de 2026" ou, para versões agrupadas por mês, "outubro de 2026". */
export function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS[(m ?? 1) - 1];
  return d ? `${d} de ${month} de ${y}` : `${month} de ${y}`;
}
