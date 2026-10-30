/**
 * Guias das telas do painel (botão "?" no topo) — linguagem de terreiro.
 *
 * Cada rota (`router.pathname`) tem os seus passos, ancorados em `data-tour="..."`.
 * Descreva a tela inteira: o `AdminTopbar` monta o roteiro com `buildGuideSteps`
 * (`tourContent.tsx`), que tira os passos cujo elemento não está na tela naquele
 * momento (sem plano, sem permissão, sem dados, aba fechada ou tela de celular).
 * O primeiro passo de cada tela apresenta a tela e deve existir sempre.
 *
 * Mudou a tela? Atualize o guia junto (R-02): o teste `adminTourSteps.test.ts`
 * confere que toda âncora daqui existe no código.
 */
import type { GuideStep } from './tourContent';

const s = (tour: string, title: string, body: string): GuideStep => ({
  selector: `[data-tour="${tour}"]`,
  title,
  body,
});

export const HELP_STEP = s(
  'topbar-help',
  'Um guia em cada tela',
  'Toda tela do painel tem o seu guia. Sempre que bater uma dúvida, toque neste botão.',
);

export const adminTourSteps: Record<string, GuideStep[]> = {
  '/admin/dashboard': [
    s('dashboard-greeting', 'Seu painel', 'Um resumo do terreiro para o dia. O botão ao lado recarrega os números.'),
    s(
      'first-gira-checklist',
      'Seus primeiros passos',
      'O roteiro do que falta para o terreiro começar a usar o GiraHub. Cada passo se marca sozinho quando você faz a tarefa.',
    ),
    s(
      'dashboard-gira-hoje',
      'A próxima gira',
      'A gira de hoje (ou a próxima) com quantas senhas já saíram. Daqui você abre a Porta, vê as senhas ou compartilha o link no WhatsApp.',
    ),
    s(
      'dashboard-kpis',
      'Os números das senhas',
      'Senhas emitidas, atendidas, o comparecimento (quem pegou senha e veio) e quantas pessoas chegaram sem senha. O número menor mostra o movimento de hoje.',
    ),
    s(
      'dashboard-chart',
      'Últimos 7 dias',
      'Quantas senhas saíram em cada dia, separando comum, associado e quem chegou sem senha. Toque numa barra para ver o detalhe.',
    ),
    s(
      'dashboard-peak-hours',
      'Horários de pico',
      'Em que horário as pessoas mais pegam senha. Ajuda a escolher a hora de abrir o link nas próximas giras.',
    ),
    s(
      'dashboard-giras',
      'Próximas giras',
      'A agenda das próximas giras, com a barra de senhas retiradas. Barra cheia quer dizer gira lotada.',
    ),
    s(
      'dashboard-aniversariantes',
      'Aniversariantes da semana',
      'Os médiuns que fazem aniversário nesta semana, para a casa não esquecer ninguém.',
    ),
    s(
      'dashboard-estoque',
      'Alertas de estoque',
      'Aparece quando vela, erva, bebida ou outro material fica abaixo do mínimo. Em "Ver relatório" você vê o que repor.',
    ),
    HELP_STEP,
  ],

  '/admin/giras': [
    s('giras-header', 'Giras', 'A agenda do terreiro. Cada gira tem o seu link de senhas, que você manda no grupo de WhatsApp.'),
    s(
      'giras-nova',
      'Nova gira',
      'Em três passos a gira fica pronta: nome e data, quantas senhas e quando o link abre. O link sai pronto para compartilhar.',
    ),
    s('giras-usage', 'Limite do plano', 'Quantas giras você já criou neste mês e quantas o seu plano permite.'),
    s(
      'giras-tabela',
      'Suas giras',
      'Cada cartão mostra a situação das senhas e um botão com a próxima ação: compartilhar o link, abrir a Porta ou configurar as senhas. As giras que já passaram ficam guardadas no fim da lista.',
    ),
    s(
      'giras-acoes',
      'Mais ações',
      'No menu de três pontinhos: compartilhar o link, abrir a Porta, ver as senhas, configurar as senhas, liberar agora, editar ou excluir a gira.',
    ),
  ],

  '/admin/tickets': [
    s('tickets-header', 'Senhas', 'Todas as senhas de uma gira: quem pegou, o contato, a situação e quem atendeu.'),
    s('tickets-gira-select', 'Escolha a gira', 'Comece por aqui. A lista abaixo mostra as senhas da gira escolhida.'),
    s('tickets-busca', 'Buscar', 'Ache uma senha pelo número, pelo nome ou pelo e-mail de quem pegou.'),
    s(
      'tickets-filtros',
      'Filtros',
      'Filtre pela situação (aguardando, atendidas, não veio, canceladas) e pela data das giras.',
    ),
    s('tickets-pdf', 'Lista em PDF', 'Baixa a lista completa das senhas da gira, boa para imprimir e deixar na porta.'),
    s(
      'tickets-fila-espera',
      'Fila de espera',
      'Quando a gira lota e a fila de espera está ligada, quem ficou de fora aparece aqui. Se alguém cancela, o próximo da fila sobe sozinho e recebe um e-mail. Você também pode agir na mão: o ✓ promove pedindo confirmação e o ⚡ libera a senha na hora.',
    ),
    s(
      'tickets-tabela',
      'A lista',
      'Toque numa senha para ver os detalhes, anotar o atendimento ou cancelar. Marque várias para agir de uma vez: dar como atendidas ou cancelar.',
    ),
  ],

  '/admin/porta': [
    s(
      'porta-header',
      'A Porta',
      'A tela do dia da gira, feita para usar no celular, em pé na entrada. A parte de cima fica fixa enquanto você rola a fila.',
    ),
    s(
      'porta-gira-select',
      'Qual gira',
      'Aparecem as giras de hoje e das próximas horas. Ao lado ficam o som (avisa quando entra alguém na fila), a chamada da corrente, quando o plano tem, e o modo TV para o telão.',
    ),
    s(
      'porta-chamar',
      'Chamar próximo',
      'Chama a próxima senha da fila (quem já chegou tem a vez). Você escolhe o médium e o cambone e o atendimento já fica registrado.',
    ),
    s('porta-walkin', 'Chegou sem senha?', 'Toque em "Sem senha" para pôr na fila quem chegou sem ter pegado senha pelo link.'),
    s(
      'porta-stats',
      'Resumo',
      'Quantos aguardam, quantos já foram atendidos e quantos não vieram. Toque para ver o resumo completo e as senhas finalizadas. Atualiza sozinho a cada 8 segundos.',
    ),
    s(
      'porta-duplas',
      'Duplas da noite',
      'Marque quais médiuns trabalham hoje e o cambone de cada um. Na hora de chamar, um toque no médium já preenche o cambone.',
    ),
    s('porta-busca', 'Buscar', 'Ache qualquer pessoa pelo nome ou pelo número da senha, mesmo com a fila grande.'),
    s(
      'porta-fila',
      'A fila',
      'No menu de cada senha: Chegou (marca a chegada), Chamar, Não veio e Editar. Errou? Dá para desfazer pelo aviso que aparece logo depois.',
    ),
  ],

  '/admin/users': [
    s('users-header', 'Pessoas e acessos', 'Quem entra no sistema do terreiro e o que cada pessoa pode fazer.'),
    s(
      'users-novo',
      'Nova pessoa',
      'Dê acesso a alguém da casa. Administrador faz tudo; operador faz só o que o grupo de permissão dele libera.',
    ),
    s('users-filtro', 'Filtro', 'Veja só os administradores ou só os operadores.'),
    s(
      'users-tabela',
      'Quem tem acesso',
      'Edite ou remova um acesso. Por segurança, ninguém remove o próprio acesso e o último administrador ativo sempre fica.',
    ),
  ],

  '/admin/permission-groups': [
    s(
      'permissoes-header',
      'Grupos de permissão',
      'Cada grupo diz o que os operadores podem ver e fazer em cada parte do sistema. Administradores fazem tudo e não precisam de grupo.',
    ),
    s(
      'permissoes-novo',
      'Novo grupo',
      'Por exemplo, um grupo só com a Porta e as Senhas para quem fica na entrada. Depois de criar, você marca o que o grupo pode fazer e quem faz parte dele.',
    ),
    s(
      'permissoes-tabela',
      'Seus grupos',
      'Toque num grupo para mudar as permissões e as pessoas. Operador sem grupo não acessa nada; o grupo "Acesso total" recebe os operadores novos.',
    ),
  ],

  '/admin/mediuns': [
    s(
      'mediuns-header',
      'Médiuns e cambones',
      'A corrente da casa: quem atende e quem auxilia. Daqui você também chega aos grupos da corrente e à ficha espiritual, quando o plano tem.',
    ),
    s('mediuns-usage', 'Limite do plano', 'Quantos médiuns estão cadastrados e quantos o seu plano permite.'),
    s(
      'mediuns-busca',
      'Buscar',
      'Ache pelo nome. Ao lado, "Incluir inativos" mostra quem saiu da corrente, e o botão de aniversariantes mostra quem faz aniversário na semana.',
    ),
    s('mediuns-novo', 'Cadastrar', 'Cadastre médium ou cambone com nome, contato, aniversário e endereço.'),
    s('mediuns-tabela', 'A corrente', 'Toque numa pessoa para ver e editar o cadastro.'),
  ],

  '/admin/mediuns/grupos': [
    s(
      'grupos-header',
      'Grupos da corrente',
      'Separe a corrente em grupos (G1, G2, Ogãs, Desenvolvimento…). Eles servem para mandar avisos e estudos só para quem precisa e para montar a escala de faxina.',
    ),
    s('grupos-novo', 'Novo grupo', 'Dê um nome, escolha uma cor e coloque os médiuns. O médium vê só o nome do grupo dele.'),
    s(
      'grupos-lista',
      'Seus grupos',
      'Edite ou arquive um grupo. Arquivado, ele sai das telas e dos avisos, mas os membros ficam guardados e voltam se você trouxer o grupo de volta.',
    ),
  ],

  '/admin/mediuns/ficha': [
    s(
      'ficha-header',
      'Ficha espiritual',
      'Os campos da ficha espiritual da casa. A ficha de cada médium só é preenchida com a autorização dele, e ele só vê o que a casa liberar.',
    ),
    s(
      'ficha-novo',
      'Novo campo',
      'Crie um campo do jeito da casa: texto, data, lista ou sim/não. Você escolhe se o médium vê e se pode sugerir mudança.',
    ),
    s(
      'ficha-sugestoes',
      'Sugestões dos médiuns',
      'Quando um médium sugere uma correção na ficha, ela chega aqui. Aceitar grava na ficha; recusar descarta.',
    ),
    s(
      'ficha-campos',
      'Campos da ficha',
      'Comece por um modelo de Umbanda ou de Candomblé e ajuste. Arquivar tira o campo da ficha sem apagar o que já foi preenchido.',
    ),
  ],

  '/admin/associados': [
    s(
      'associados-header',
      'Associados',
      'Quem contribui com a casa. Associado pode ter senha especial e prioridade na fila da Porta.',
    ),
    s('associados-novo', 'Novo associado', 'Cadastre com nome, e-mail e telefone.'),
    s(
      'associados-tabela',
      'Seus associados',
      'Edite ou remova um associado. A mensalidade dos associados fica em Financeiro → Mensalidades.',
    ),
  ],

  '/admin/analytics': [
    s(
      'analytics-header',
      'Analytics',
      'Os números das senhas por período ou por gira: quantas saíram, quantas foram usadas e em que horário.',
    ),
    s(
      'analytics-filtros',
      'Período e gira',
      'Escolha um período pronto ou as suas datas e, se quiser, uma gira só. Tudo abaixo se atualiza na hora.',
    ),
    s(
      'analytics-kpis',
      'Indicadores',
      'Total emitido, total utilizado, taxa de uso, cancelados, quem chegou sem senha e o movimento de hoje.',
    ),
    s(
      'analytics-chart-line',
      'Por dia',
      'Senhas por dia, separadas em comum, associado e sem senha. Mostra os dias de mais movimento.',
    ),
    s('analytics-chart-pie', 'Por categoria', 'A proporção entre senha comum, de associado e de quem chegou sem senha.'),
    s(
      'analytics-peak',
      'Horários de pico',
      'Em que hora as pessoas mais pegam senha. Ajuda a decidir quando abrir o link e quantas pessoas pôr na porta.',
    ),
  ],

  '/admin/relatorio-gira': [
    s(
      'relatorio-header',
      'Relatório de gira',
      'Tudo o que aconteceu numa gira: cada senha, quem atendeu e as observações.',
    ),
    s(
      'relatorio-filtros-gira',
      'Escolha a gira',
      'Escolha a gira no seletor. Em "Filtros de gira" você restringe a lista por período, giras ativas ou não e situação da senha.',
    ),
    s(
      'relatorio-kpis',
      'Resumo da gira',
      'Total de senhas, concluídas, aguardando, quem chegou, quem não veio, quem chegou sem senha, preferenciais e associados.',
    ),
    s(
      'relatorio-tabela',
      'Atendimentos',
      'Cada atendimento com o número da senha, o nome, o tipo de senha, o médium, o cambone e as observações.',
    ),
    s(
      'relatorio-export',
      'Exportar',
      'O CSV abre em planilha. O PDF sai com o logo e as cores do terreiro e o resumo da gira.',
    ),
  ],

  '/admin/audit-trail': [
    s(
      'audit-header',
      'Auditoria',
      'O registro de tudo o que foi feito no painel: quem fez, o quê e quando.',
    ),
    s(
      'audit-filtros',
      'Filtros',
      'Filtre pelo tipo de ação (criação, alteração, exclusão, entrada no sistema…) ou pelo que foi mexido (pessoa, senha, gira, estoque…).',
    ),
    s(
      'audit-tabela',
      'Registros',
      'Cada linha mostra data e hora, quem fez, a ação e o que foi afetado. Em Detalhes você vê como estava antes e como ficou.',
    ),
    s('audit-export', 'Exportar', 'Baixa os registros filtrados em CSV, para guardar ou mostrar a quem precisar.'),
  ],

  '/admin/config': [
    s(
      'config-header',
      'Configurações',
      'A cara e as regras do terreiro. Quando você muda alguma coisa, aparece uma barra no rodapé com Descartar e Salvar.',
    ),
    s(
      'config-tabs',
      'Abas',
      'Identidade (nome, logo, cores e endereço), Funções (ligar e desligar partes do sistema), Atendimento (regras da fila) e, quando o plano tem, Área do Médium.',
    ),
    s('config-logo', 'Nome e logo', 'Aparecem no painel e nas páginas públicas, como a de pegar senha.'),
    s(
      'config-cores',
      'Cores e endereço',
      'Use uma paleta pronta ou escolha as suas cores. O endereço vai nos e-mails de confirmação e no botão "Como chegar".',
    ),
    s('config-preview', 'Prévia', 'Mostra como fica com as cores e o logo escolhidos, antes de salvar.'),
  ],

  '/admin/billing': [
    s('billing-trial', 'Seu mês grátis', 'Quanto falta do teste grátis e o que você já usou do plano.'),
    s(
      'billing-status',
      'Sua assinatura',
      'O plano, a próxima cobrança e o valor. Aqui você também cancela ou desfaz um cancelamento agendado.',
    ),
    s(
      'billing-planos',
      'Planos',
      'Basic, Pro e Premium e o que cada um inclui. No teste grátis, o plano em teste mostra "Continuar neste plano", e a cobrança só começa quando o teste acaba.',
    ),
    s('billing-comparativo', 'Comparativo', 'Tudo o que cada plano tem, lado a lado.'),
    s(
      'billing-suporte',
      'Ficou em dúvida?',
      'Fale com a gente pelo WhatsApp. A equipe responde rápido e ajuda a escolher o plano.',
    ),
  ],

  '/admin/profile': [
    s('profile-foto', 'Sua foto', 'Toque para escolher uma foto. Ela aparece no topo do painel.'),
    s('profile-dados', 'Seus dados', 'Atualize seu nome e telefone.'),
    s(
      'profile-senha',
      'Trocar a senha',
      'Informe a senha atual e a nova. Ao trocar, você sai de todos os aparelhos e entra de novo.',
    ),
  ],

  '/admin/estoque/grupos': [
    s(
      'estoque-grupos-header',
      'Grupos de material',
      'Organize o estoque por categoria: velas, ervas, bebidas, objetos rituais…',
    ),
    s('estoque-grupos-novo', 'Novo grupo', 'Crie um grupo com nome e descrição.'),
    s('estoque-grupos-tabela', 'Seus grupos', 'Edite ou exclua cada grupo por aqui.'),
  ],

  '/admin/estoque/itens': [
    s(
      'estoque-itens-header',
      'Itens do estoque',
      'Velas, flores, ervas e tudo o que a casa usa nas giras. Daqui você também baixa o PDF com o que precisa repor.',
    ),
    s(
      'estoque-rel-kpis',
      'Situação do estoque',
      'Quantos itens estão em dia, em atenção e críticos (abaixo do mínimo).',
    ),
    s(
      'estoque-itens-filtro',
      'Buscar e filtrar',
      'Ache um item pelo nome, filtre por grupo ou veja só os itens críticos e em atenção.',
    ),
    s(
      'estoque-itens-tabela',
      'Itens',
      'O saldo de cada item. A cor diz a situação: verde em dia, amarelo atenção, vermelho crítico.',
    ),
    s(
      'estoque-itens-novo',
      'Novo item',
      'Cadastre o item com nome, grupo, unidade e estoque mínimo. Abaixo do mínimo, o painel avisa.',
    ),
    s('estoque-rel-export', 'Exportar', 'Baixa a posição do estoque em CSV, para abrir em planilha.'),
  ],

  '/admin/estoque/movimentacoes': [
    s(
      'estoque-mov-header',
      'Movimentações',
      'O que entrou e saiu do estoque. Cada registro muda o saldo do item.',
    ),
    s(
      'estoque-mov-nova',
      'Registrar',
      'Registre uma entrada (compra, doação) ou uma saída (uso na gira), com o item, a quantidade e o motivo.',
    ),
    s('estoque-mov-filtros', 'Buscar e filtrar', 'Ache pelo nome do item ou filtre por entrada ou saída.'),
    s(
      'estoque-mov-tabela',
      'Histórico',
      'Tudo o que foi registrado. Lançou errado? Dá para editar ou excluir o registro.',
    ),
  ],

  '/admin/financeiro/mensalidades': [
    s(
      'mensalidades-header',
      'Mensalidades',
      'A cobrança mensal de médiuns e associados. Use as setas para trocar de mês.',
    ),
    s(
      'mensalidades-kpis',
      'O mês em números',
      'Quanto era esperado, quanto entrou, quantos estão inadimplentes e quanto ainda está em aberto.',
    ),
    s(
      'mensalidades-comprovantes',
      'Comprovantes para conferir',
      'Quando um médium manda o comprovante pela Área do Médium, ele chega aqui para você confirmar.',
    ),
    s(
      'mensalidades-abas',
      'Médiuns, associados e histórico',
      'Em cada lista, registre o pagamento, isente ou baixe o comprovante; dá para filtrar por situação e marcar vários de uma vez. O Histórico compara o esperado com o arrecadado nos últimos meses.',
    ),
  ],

  '/admin/financeiro/lancamentos': [
    s(
      'lancamentos-header',
      'Lançamentos',
      'As contas da casa num lugar só: o que entra (doações, festas, mensalidades) e o que sai (aluguel, luz, material).',
    ),
    s('lancamentos-tipo', 'Entradas e saídas', 'Alterne entre o que a casa tem a receber e o que tem a pagar.'),
    s('lancamentos-kpis', 'O mês', 'Quanto está pendente, quanto venceu e quanto já foi pago no mês escolhido.'),
    s('lancamentos-filtros', 'Filtros', 'Escolha o mês, o ano, a situação e a categoria.'),
    s(
      'lancamentos-novo',
      'Novo lançamento',
      'Registre a conta com valor, vencimento e categoria. Quando pagar ou receber, é só dar baixa.',
    ),
    s(
      'lancamentos-tabela',
      'Contas do mês',
      'As mensalidades entram aqui sozinhas; o pagamento delas é registrado em Mensalidades.',
    ),
  ],

  '/admin/financeiro/fluxo-de-caixa': [
    s(
      'fluxo-header',
      'Fluxo de caixa',
      'Como o dinheiro da casa entrou e saiu, mês a mês, e o saldo acumulado.',
    ),
    s(
      'fluxo-periodo',
      'Período',
      'Escolha um período pronto ou as suas datas e, se a casa tiver mais de uma, a conta bancária.',
    ),
    s(
      'fluxo-kpis',
      'Resumo',
      'O saldo acumulado, o que foi recebido e pago no período e o saldo das contas ainda pendentes.',
    ),
    s('fluxo-grafico', 'Mês a mês', 'Recebido e pago em cada mês, com a linha do saldo acumulado.'),
    s('fluxo-tabela', 'Tabela', 'Os mesmos números, mês a mês.'),
    s(
      'fluxo-pdf',
      'Relatório em PDF',
      'Para a diretoria ou o contador: o resumo e, depois, cada lançamento recebido e pago de cada mês.',
    ),
  ],

  '/admin/financeiro/por-categoria': [
    s(
      'categoria-header',
      'Por categoria',
      'Quanto entrou e saiu em cada categoria no período. Os botões do topo baixam a planilha (CSV) ou o PDF.',
    ),
    s('categoria-periodo', 'Período', 'Escolha um período pronto ou as suas datas.'),
    s('categoria-lado', 'Entradas ou saídas', 'Troque entre o que entrou e o que saiu.'),
    s('categoria-grafico', 'Gráfico', 'Cada barra é uma categoria. Mostra para onde vai e de onde vem o dinheiro da casa.'),
    s('categoria-tabela', 'Tabela', 'Os valores de cada categoria e, em períodos de até um ano, o que foi realizado mês a mês.'),
  ],

  '/admin/financeiro/config': [
    s('fin-config-header', 'Configuração financeira', 'Onde se prepara o financeiro da casa.'),
    s(
      'fin-config-abas',
      'Abas',
      'Categorias (para organizar os lançamentos) e Contas bancárias (conta, poupança ou o caixa da casa), quando o plano tem, e Mensalidade: valor, dia de vencimento e a chave PIX para a corrente pagar.',
    ),
  ],

  '/admin/atividades': [
    s(
      'atividades-header',
      'Atividades e escalas',
      'Faxina, rituais, reuniões e desenvolvimento. Ficam só na Área do Médium: não vão para o site e não contam no limite de giras.',
    ),
    s(
      'atividades-abas',
      'Abas',
      'Agenda da casa, escala de faxina, tipos de atividade e funções, relatórios de presença e as trocas de escala pedidas pelos médiuns.',
    ),
    s(
      'atividades-nova',
      'Nova atividade',
      'Escolha o tipo, a data e as orientações para a corrente. Se for só para quem está na escala, você já escolhe os grupos e os médiuns.',
    ),
    s('atividades-filtro', 'Filtrar', 'Veja só um tipo de atividade.'),
    s(
      'atividades-agenda',
      'Agenda do mês',
      'As giras e atividades do mês. Em cada uma: Confirmações (quem vai e quem não vai), Chamada no dia e, quando houver, a Escala por função.',
    ),
  ],

  '/admin/comunicados': [
    s(
      'avisos-header',
      'Avisos',
      'Recados para a corrente, que chegam no celular de cada médium pela Área do Médium.',
    ),
    s(
      'avisos-novo',
      'Novo aviso',
      'Escreva o aviso e escolha para quem vai: toda a corrente, alguns grupos ou médiuns específicos. Dá para agendar, fixar no topo e mandar por e-mail também.',
    ),
    s(
      'avisos-lista',
      'Avisos publicados',
      'Toque num aviso para ver quem leu e quem ainda não leu. "Lembrar quem não leu" monta uma mensagem pronta para o WhatsApp.',
    ),
  ],

  '/admin/materiais': [
    s(
      'materiais-header',
      'Estudos e documentos',
      'Apostilas, pontos cantados, rezas e vídeos para a corrente estudar pela Área do Médium.',
    ),
    s(
      'materiais-novo',
      'Novo material',
      'Publique um link (Drive, YouTube), um texto ou um ponto cantado com a letra. Escolha para quem vai e deixe como rascunho até estar pronto.',
    ),
    s('materiais-tabela', 'Seus materiais', 'Use as setas para mudar a ordem em que a corrente vê os materiais.'),
  ],

  '/admin/cursos-presenciais': [
    s(
      'cursos-header',
      'Cursos presenciais',
      'As turmas de cursos da casa, cada uma com uma página pública de inscrição.',
    ),
    s('cursos-novo', 'Novo curso', 'Cadastre a turma com título, datas e informações para quem for se inscrever.'),
    s(
      'cursos-tabela',
      'Seus cursos',
      'No menu de cada curso: ver os participantes, copiar o link de inscrição para divulgar, editar ou excluir.',
    ),
  ],

  '/admin/meu-site': [
    s(
      'site-barra',
      'Meu Site',
      'Aqui você monta a página do terreiro na internet. Esta barra mostra se o site está publicado e se as mudanças já foram salvas.',
    ),
    s(
      'site-secoes',
      'Seções',
      'As partes do site, na ordem em que aparecem. Mude a ordem, esconda ou adicione seções. Em Histórico você volta a uma versão anterior.',
    ),
    s('site-editor', 'Editar', 'Escolha uma seção na lista para mudar os textos e as imagens.'),
    s('site-previa', 'Prévia', 'Mostra como o site vai ficar, no computador e no celular, antes de publicar.'),
    s('site-previa-botao', 'Prévia', 'Toque aqui para ver como o site vai ficar antes de publicar.'),
    s('site-config', 'Configurações do site', 'O endereço do site e como ele aparece no Google.'),
    s(
      'site-publicar',
      'Publicar',
      'As mudanças ficam num rascunho, salvo sozinho. Só vão para o ar quando você toca em Publicar.',
    ),
  ],

  '/admin/suporte': [
    s(
      'suporte-header',
      'Suporte',
      'Aqui você acompanha, só para leitura, as conversas das pessoas do terreiro com o suporte do GiraHub. Para falar com o suporte, use "Falar com o suporte" no menu do seu perfil.',
    ),
  ],
};

/** Passos do guia da rota (`router.pathname`, com `[id]` nas rotas dinâmicas). */
export function getAdminTourSteps(pathname: string): GuideStep[] {
  return adminTourSteps[pathname] ?? [];
}
