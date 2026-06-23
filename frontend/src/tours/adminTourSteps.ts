/**
 * Roteiro de uso do painel admin — linguagem de terreiro.
 * Cada rota tem seus próprios steps com seletores `data-tour="..."`.
 */
import type { StepType } from '@reactour/tour';

type TourStepMap = Record<string, StepType[]>;

export const adminTourSteps: TourStepMap = {
  '/admin/dashboard': [
    {
      selector: '[data-tour="dashboard-greeting"]',
      content:
        'Bem-vindo ao seu painel! Aqui você tem uma visão geral do terreiro — atualizada em tempo real. Use o botão de refresh para recarregar os dados a qualquer momento.',
    },
    {
      selector: '[data-tour="dashboard-kpis"]',
      content:
        'Esses quatro cartões mostram o panorama de senhas do terreiro: total emitido, total utilizado, taxa de aproveitamento e entradas presenciais (walk-in). O número menor abaixo indica o movimento de hoje.',
    },
    {
      selector: '[data-tour="dashboard-chart"]',
      content:
        'Este gráfico mostra a distribuição de senhas emitidas nos últimos 7 dias — separando senhas comuns, de associados e entradas presenciais. Passe o mouse pelas barras para ver os detalhes de cada dia.',
    },
    {
      selector: '[data-tour="dashboard-peak-hours"]',
      content:
        'Veja em quais horários o movimento de emissões é maior. Use essa informação para planejar o horário de abertura das filas nas próximas giras.',
    },
    {
      selector: '[data-tour="dashboard-giras"]',
      content:
        'Aqui aparecem as próximas giras do seu terreiro. A barra de progresso mostra quantas senhas já foram retiradas em relação ao limite. Quando a barra fica vermelha, a gira está lotada.',
    },
    {
      selector: '[data-tour="dashboard-estoque"]',
      content:
        'Se algum item do estoque estiver abaixo do mínimo configurado, um alerta aparece aqui — separando itens em atenção dos que estão em situação crítica.',
    },
  ],

  '/admin/giras': [
    {
      selector: '[data-tour="giras-header"]',
      content:
        'Gerencie todas as giras do seu terreiro aqui. Crie novas giras, edite as existentes e controle a abertura de senhas.',
    },
    {
      selector: '[data-tour="giras-nova"]',
      content:
        'Clique aqui para cadastrar uma nova gira. Informe o nome, a descrição e a data de início.',
    },
    {
      selector: '[data-tour="giras-usage"]',
      content:
        'Esta barra mostra quantas giras já foram criadas no mês em relação ao limite do seu plano.',
    },
    {
      selector: '[data-tour="giras-tabela"]',
      content:
        'Aqui está a lista de todas as giras. Você vê o status (aberta ou encerrada), as senhas emitidas e pode acessar as ações de cada gira.',
    },
    {
      selector: '[data-tour="giras-acoes"]',
      content:
        'Use o menu de ações (três pontinhos) para editar, configurar senhas, copiar o link de emissão ou encerrar uma gira.',
    },
  ],

  '/admin/tickets': [
    {
      selector: '[data-tour="tickets-header"]',
      content:
        'Aqui você visualiza e gerencia as senhas emitidas pelos consulentes para cada gira.',
    },
    {
      selector: '[data-tour="tickets-gira-select"]',
      content:
        'Primeiro, escolha a gira que deseja consultar. A lista de senhas será carregada automaticamente.',
    },
    {
      selector: '[data-tour="tickets-filtros"]',
      content:
        'Use os filtros para encontrar senhas por situação (aguardando, atendido, cancelado) ou por data de emissão.',
    },
    {
      selector: '[data-tour="tickets-tabela"]',
      content:
        'Esta tabela mostra todos os consulentes que retiraram senha: nome, contato, tipo de senha, status e o médium que realizou o atendimento.',
    },
    {
      selector: '[data-tour="tickets-export"]',
      content:
        'Exporte a lista de senhas para uma planilha (CSV) para análise ou arquivo da gira.',
    },
  ],

  '/admin/porta': [
    {
      selector: '[data-tour="porta-header"]',
      content:
        'A Visão da Porta é a central de atendimento em tempo real. Selecione a gira pelo seletor abaixo do título e a fila é carregada automaticamente. O relógio no canto superior direito mostra o horário da última atualização.',
    },
    {
      selector: '[data-tour="porta-gira-select"]',
      content:
        'Escolha a gira que está acontecendo agora. Apenas giras das últimas 24 horas aparecem aqui. O ponto verde ao lado do nome indica gira ativa. Se walk-in estiver habilitado, o botão "Walk-in" aparecerá ao lado do seletor.',
    },
    {
      selector: '[data-tour="porta-stats"]',
      content:
        'Painel de números em tempo real: Total, Atendidos, Em atendimento, Aguardando (com check-in feito), Walk-ins, Preferenciais, Ausentes e Check-ins totais. Os números se atualizam a cada 8 segundos.',
    },
    {
      selector: '[data-tour="porta-busca"]',
      content:
        'Busque qualquer consulente pelo nome para encontrá-lo na fila, mesmo quando a lista estiver longa.',
    },
    {
      selector: '[data-tour="porta-fila"]',
      content:
        'A fila de espera lista todos os tickets emitidos. Borda azul = check-in feito (pessoa já chegou). Borda verde = próximo a ser chamado. Use o check-in para confirmar a chegada antes de chamar para o atendimento.',
    },
    {
      selector: '[data-tour="porta-walkin"]',
      content:
        'Registre entradas presenciais (walk-in) para quem chegou sem senha pré-emitida. Informe o nome e, opcionalmente, contato e categoria preferencial.',
    },
  ],

  '/admin/users': [
    {
      selector: '[data-tour="users-header"]',
      content:
        'Aqui você gerencia quem tem acesso ao painel administrativo do terreiro.',
    },
    {
      selector: '[data-tour="users-novo"]',
      content:
        'Crie um novo acesso informando e-mail, nome de usuário, senha e o perfil de acesso (Admin ou Operador).',
    },
    {
      selector: '[data-tour="users-filtro"]',
      content:
        'Filtre os usuários por perfil: todos, administradores ou operadores.',
    },
    {
      selector: '[data-tour="users-tabela"]',
      content:
        'Lista de todos os usuários com acesso ao painel. Você pode editar ou remover um acesso diretamente por aqui.',
    },
  ],

  '/admin/mediuns': [
    {
      selector: '[data-tour="mediuns-header"]',
      content:
        'Cadastre e gerencie os médiuns do terreiro. Eles podem ser vinculados aos atendimentos realizados na gira.',
    },
    {
      selector: '[data-tour="mediuns-usage"]',
      content:
        'Esta barra mostra quantos médiuns estão cadastrados em relação ao limite do seu plano.',
    },
    {
      selector: '[data-tour="mediuns-busca"]',
      content:
        'Busque médiuns pelo nome. Você pode incluir os inativos na pesquisa usando o botão ao lado.',
    },
    {
      selector: '[data-tour="mediuns-novo"]',
      content:
        'Cadastre um novo médium informando nome, tipo (atendimento ou cambone), contato e endereço.',
    },
    {
      selector: '[data-tour="mediuns-tabela"]',
      content:
        'Lista de todos os médiuns cadastrados com seu tipo e situação (ativo ou inativo).',
    },
  ],

  '/admin/associados': [
    {
      selector: '[data-tour="associados-header"]',
      content:
        'Gerencie os associados do terreiro. Consulentes marcados como associados podem ter prioridade no atendimento.',
    },
    {
      selector: '[data-tour="associados-novo"]',
      content:
        'Cadastre um novo associado com nome, e-mail e telefone.',
    },
    {
      selector: '[data-tour="associados-tabela"]',
      content:
        'Lista de todos os associados cadastrados. Você pode editar ou remover um associado por aqui.',
    },
  ],

  '/admin/analytics': [
    {
      selector: '[data-tour="analytics-header"]',
      content:
        'O painel de Analytics apresenta métricas detalhadas de emissão e uso de senhas por período ou por gira específica.',
    },
    {
      selector: '[data-tour="analytics-filtros"]',
      content:
        'Defina o intervalo de datas e, opcionalmente, filtre por uma gira. Os gráficos e KPIs se atualizam automaticamente a cada mudança.',
    },
    {
      selector: '[data-tour="analytics-kpis"]',
      content:
        'Cinco indicadores rápidos do período: total emitido, total utilizado, taxa de uso (%), cancelados e entradas walk-in.',
    },
    {
      selector: '[data-tour="analytics-chart-line"]',
      content:
        'Distribuição diária empilhada por categoria (Comum, Associado e Walk-in). Identifique os dias de pico e o perfil de cada gira.',
    },
    {
      selector: '[data-tour="analytics-chart-pie"]',
      content:
        'Proporção entre as categorias de ticket. Quanto maior a fatia de Associados ou Walk-ins, maior é o engajamento fora da lista regular.',
    },
    {
      selector: '[data-tour="analytics-peak"]',
      content:
        'Horários de maior emissão ao longo do dia, exibidos como barras de progresso. Use para dimensionar a equipe e planejar a abertura das filas.',
    },
  ],

  '/admin/relatorio-gira': [
    {
      selector: '[data-tour="relatorio-header"]',
      content:
        'O Relatório de Gira reúne todos os atendimentos de uma gira em uma tabela filtrável. Quando uma gira estiver selecionada, os botões de exportação aparecem aqui no canto direito.',
    },
    {
      selector: '[data-tour="relatorio-filtros-gira"]',
      content:
        'Comece escolhendo a gira no seletor. Clique em "Filtros de gira" para refinar por período, tipo (ativas/inativas) e status do ticket. O badge vermelho indica quantos filtros estão ativos.',
    },
    {
      selector: '[data-tour="relatorio-kpis"]',
      content:
        'Após selecionar uma gira, este painel de números mostra o resumo completo: total de tickets, concluídos, aguardando, em atendimento, no-shows, walk-ins, preferenciais e associados.',
    },
    {
      selector: '[data-tour="relatorio-tabela"]',
      content:
        'A tabela lista todos os atendimentos com número da senha, nome do consulente, tag (Comum, Preferencial, Associado ou Walk-in), médium, cambone e observações do atendimento.',
    },
    {
      selector: '[data-tour="relatorio-export"]',
      content:
        'Exporte os dados filtrados em CSV (para planilhas) ou em PDF formatado — com logo do terreiro, cores da identidade visual e resumo estatístico da gira.',
    },
  ],

  '/admin/audit-trail': [
    {
      selector: '[data-tour="audit-header"]',
      content:
        'A Auditoria registra cada ação feita no painel: quem fez, o quê, e quando. O botão "Exportar CSV" no canto superior direito baixa todos os registros filtrados.',
    },
    {
      selector: '[data-tour="audit-filtros"]',
      content:
        'Filtre por tipo de ação (Criação, Alteração, Exclusão, Login…) ou por tipo de recurso (Usuário, Ticket, Gira, Estoque…). O contador à direita mostra quantos registros combinam com os filtros.',
    },
    {
      selector: '[data-tour="audit-tabela"]',
      content:
        'Cada linha mostra data/hora, usuário responsável, ação (com badge colorido por tipo) e recurso afetado. Na coluna Detalhes você vê os valores antes e depois de uma alteração, ou o resumo do evento.',
    },
    {
      selector: '[data-tour="audit-export"]',
      content:
        'Exporta todos os registros filtrados em CSV — útil para auditorias externas, compliance ou arquivamento histórico.',
    },
  ],

  '/admin/config': [
    {
      selector: '[data-tour="config-header"]',
      content:
        'Aqui você personaliza tudo que diz respeito ao seu terreiro — identidade visual, funcionalidades ativas e regras de atendimento. Quando houver mudanças não salvas, uma barra aparece no canto superior direito com os botões Descartar e Salvar.',
    },
    {
      selector: '[data-tour="config-tabs"]',
      content:
        'As configurações estão divididas em três abas: Identidade visual (logo e cores), Funcionalidades (módulos do sistema) e Atendimento (regras de fila). Clique em cada aba para navegar.',
    },
    {
      selector: '[data-tour="config-logo"]',
      content:
        'Faça o upload do logo do terreiro. Você pode clicar na área pontilhada ou arrastar a imagem direto para ela. Formatos aceitos: JPG, PNG e WEBP (máx. 2 MB).',
    },
    {
      selector: '[data-tour="config-cores"]',
      content:
        'Defina as cores da identidade visual: primária, secundária e da fonte. Clique na bolinha colorida para abrir o seletor visual, ou digite o código hexadecimal diretamente. Informe também o endereço do terreiro — ele aparece nos e-mails como botão "Como chegar".',
    },
    {
      selector: '[data-tour="config-preview"]',
      content:
        'Este cartão mostra em tempo real como ficará a identidade visual com as cores escolhidas — antes mesmo de salvar. Qualquer mudança nas cores ou no logo é refletida aqui instantaneamente.',
    },
  ],

  '/admin/billing': [
    {
      selector: '[data-tour="billing-header"]',
      content:
        'Esta é a página de Assinatura — aqui você acompanha seu plano atual, data de cobrança e pode fazer upgrade, downgrade ou cancelar quando precisar.',
    },
    {
      selector: '[data-tour="billing-status"]',
      content:
        'O cartão de status mostra seu plano ativo, a data da próxima cobrança e o valor mensal. Se você quiser cancelar a assinatura ou reativar um cancelamento agendado, os botões ficam aqui.',
    },
    {
      selector: '[data-tour="billing-planos"]',
      content:
        'Abaixo você encontra a comparação entre os planos disponíveis: Basic, Pro e Premium. Cada cartão lista as funcionalidades incluídas e o botão de contratação. O plano atual fica destacado e desabilitado.',
    },
    {
      selector: '[data-tour="billing-suporte"]',
      content:
        'Ficou com dúvida sobre qual plano escolher? Entre em contato direto pelo WhatsApp — nossa equipe responde rapidamente.',
    },
  ],

  '/admin/plano': [
    {
      selector: '[data-tour="plano-header"]',
      content:
        'Esta página mostra seu plano atual, o quanto você já usou dos limites e uma tabela comparativa com todos os planos disponíveis.',
    },
    {
      selector: '[data-tour="plano-status"]',
      content:
        'O cartão de status exibe seu plano ativo e as barras de uso para usuários, giras do mês e médiuns. As barras ficam amarelas quando você está próximo do limite e vermelhas ao atingir 90%.',
    },
    {
      selector: '[data-tour="plano-comparativo"]',
      content:
        'A tabela comparativa mostra todas as funcionalidades agrupadas por categoria — base, capacidade, comunicação, relatórios, módulos e enterprise. A coluna do seu plano atual fica destacada.',
    },
    {
      selector: '[data-tour="plano-contato"]',
      content:
        'Para fazer upgrade ou tirar dúvidas, entre em contato pelo WhatsApp ou e-mail. Nossa equipe cuida da alteração de forma rápida e segura.',
    },
  ],

  '/admin/profile': [
    {
      selector: '[data-tour="profile-foto"]',
      content:
        'Clique para fazer upload de uma foto de perfil. Ela aparece no cabeçalho do painel.',
    },
    {
      selector: '[data-tour="profile-dados"]',
      content:
        'Atualize seu nome completo e telefone de contato.',
    },
    {
      selector: '[data-tour="profile-senha"]',
      content:
        'Para alterar a sua senha de acesso, informe a senha atual e a nova senha (mínimo 12 caracteres).',
    },
  ],

  '/admin/estoque/grupos': [
    {
      selector: '[data-tour="estoque-grupos-header"]',
      content:
        'Os grupos organizam os materiais do terreiro por categoria — por exemplo: velas, ervas, objetos rituais.',
    },
    {
      selector: '[data-tour="estoque-grupos-novo"]',
      content:
        'Crie um novo grupo de materiais informando nome e descrição.',
    },
    {
      selector: '[data-tour="estoque-grupos-tabela"]',
      content:
        'Lista de todos os grupos cadastrados. Você pode editar ou excluir cada grupo por aqui.',
    },
  ],

  '/admin/estoque/itens': [
    {
      selector: '[data-tour="estoque-itens-header"]',
      content:
        'Gerencie os itens do estoque do terreiro — velas, flores, ervas e todos os materiais utilizados nas giras.',
    },
    {
      selector: '[data-tour="estoque-itens-filtro"]',
      content:
        'Filtre os itens por grupo para localizar mais facilmente.',
    },
    {
      selector: '[data-tour="estoque-itens-tabela"]',
      content:
        'Lista de itens com saldo atual. A cor indica a situação: verde (OK), amarelo (atenção) e vermelho (crítico — abaixo do mínimo).',
    },
    {
      selector: '[data-tour="estoque-itens-novo"]',
      content:
        'Cadastre um novo item informando nome, grupo, unidade de medida e estoque mínimo.',
    },
  ],

  '/admin/estoque/movimentacoes': [
    {
      selector: '[data-tour="estoque-mov-header"]',
      content:
        'Registre entradas e saídas de materiais do estoque do terreiro.',
    },
    {
      selector: '[data-tour="estoque-mov-nova"]',
      content:
        'Clique aqui para registrar uma nova movimentação — informe o item, o tipo (entrada ou saída), a quantidade e o motivo.',
    },
    {
      selector: '[data-tour="estoque-mov-filtros"]',
      content:
        'Filtre o histórico de movimentações por item, tipo, período ou responsável.',
    },
    {
      selector: '[data-tour="estoque-mov-tabela"]',
      content:
        'Histórico de todas as movimentações. Este registro é imutável — não é possível editar ou excluir movimentações registradas.',
    },
  ],

  '/admin/estoque/relatorio': [
    {
      selector: '[data-tour="estoque-rel-header"]',
      content:
        'Relatório geral do estoque do terreiro.',
    },
    {
      selector: '[data-tour="estoque-rel-kpis"]',
      content:
        'Resumo rápido: quantos itens estão em situação OK, quantos precisam de atenção e quantos estão em nível crítico.',
    },
    {
      selector: '[data-tour="estoque-rel-filtros"]',
      content:
        'Filtre por nome ou grupo para encontrar um item específico.',
    },
    {
      selector: '[data-tour="estoque-rel-tabela"]',
      content:
        'Lista de todos os itens com saldo atual, mínimo, unidade e última movimentação.',
    },
    {
      selector: '[data-tour="estoque-rel-export"]',
      content:
        'Exporte o relatório de estoque para planilha (CSV).',
    },
  ],
};

/**
 * Retorna os steps para a rota atual.
 * Normaliza rotas com parâmetros dinâmicos (ex: /admin/tickets/123/email → excluído).
 */
export function getAdminTourSteps(pathname: string): StepType[] {
  return adminTourSteps[pathname] ?? [];
}
