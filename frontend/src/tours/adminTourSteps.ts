/**
 * Roteiro de uso do painel admin — linguagem de terreiro.
 * Cada rota tem seus próprios steps com seletores `data-tour="..."`.
 */
import type { StepType } from '@reactour/tour';

type TourStepMap = Record<string, StepType[]>;

export const adminTourSteps: TourStepMap = {
  '/admin/dashboard': [
    {
      selector: '[data-tour="dashboard-header"]',
      content:
        'Bem-vindo ao seu painel! Aqui você acompanha o movimento do dia no terreiro — senhas emitidas, atendimentos realizados e muito mais.',
    },
    {
      selector: '[data-tour="dashboard-kpis"]',
      content:
        'Esses cartões mostram o resumo do dia: quantas senhas foram emitidas, quantas consulentes já foram atendidos e a taxa de aproveitamento da gira.',
    },
    {
      selector: '[data-tour="dashboard-giras"]',
      content:
        'Aqui aparecem as próximas giras do seu terreiro. Você pode acompanhar quantas senhas já foram retiradas e ir direto para a Porta.',
    },
    {
      selector: '[data-tour="dashboard-chart"]',
      content:
        'Este gráfico mostra a distribuição de senhas emitidas nos últimos dias — separando senhas comuns, de patrocinadores e entradas presenciais.',
    },
    {
      selector: '[data-tour="dashboard-peak-hours"]',
      content:
        'Veja em quais horários o movimento é maior. Isso ajuda a planejar melhor o atendimento nas próximas giras.',
    },
    {
      selector: '[data-tour="dashboard-quick-actions"]',
      content:
        'Atalhos rápidos para as seções mais usadas: Giras, Tickets, Porta e Configurações. Use para navegar sem perder tempo.',
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
        'A Porta é o coração do atendimento! Aqui você gerencia a fila em tempo real durante a gira.',
    },
    {
      selector: '[data-tour="porta-gira-select"]',
      content:
        'Selecione a gira que está em andamento. O sistema carrega automaticamente a fila de espera.',
    },
    {
      selector: '[data-tour="porta-ws-status"]',
      content:
        'Este indicador mostra se a conexão em tempo real está ativa (verde) ou desconectada (vermelho). O sistema se reconecta automaticamente.',
    },
    {
      selector: '[data-tour="porta-stats"]',
      content:
        'Acompanhe o resumo da fila: total de senhas, check-ins realizados, consulentes aguardando, em atendimento, atendidos e no-shows.',
    },
    {
      selector: '[data-tour="porta-busca"]',
      content:
        'Busque um consulente pelo nome ou número da senha para localizá-lo rapidamente na fila.',
    },
    {
      selector: '[data-tour="porta-fila"]',
      content:
        'A fila de espera aparece aqui. Para cada consulente você pode: fazer o check-in, chamar para atendimento ou cancelar a senha.',
    },
    {
      selector: '[data-tour="porta-walkin"]',
      content:
        'Para consulentes que chegaram pessoalmente sem retirar senha online, clique aqui para registrar a entrada presencial.',
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
        'O painel de análise mostra dados detalhados sobre o movimento do terreiro ao longo do tempo.',
    },
    {
      selector: '[data-tour="analytics-filtros"]',
      content:
        'Selecione o período e a gira que deseja analisar. Os dados são atualizados automaticamente.',
    },
    {
      selector: '[data-tour="analytics-kpis"]',
      content:
        'Números gerais do período: total de senhas emitidas, atendimentos realizados, taxa de aproveitamento e entradas presenciais.',
    },
    {
      selector: '[data-tour="analytics-chart-line"]',
      content:
        'Evolução diária das senhas emitidas. Veja os dias de maior e menor movimento.',
    },
    {
      selector: '[data-tour="analytics-chart-pie"]',
      content:
        'Distribuição por tipo de senha: comum, associado e entrada presencial.',
    },
    {
      selector: '[data-tour="analytics-peak"]',
      content:
        'Horários de pico ao longo do dia. Use para planejar o fluxo de atendimento nas próximas giras.',
    },
  ],

  '/admin/relatorio-gira': [
    {
      selector: '[data-tour="relatorio-header"]',
      content:
        'Gere relatórios detalhados de atendimento por gira.',
    },
    {
      selector: '[data-tour="relatorio-filtros"]',
      content:
        'Escolha a gira, o período e os filtros desejados — como médium responsável ou tipo de senha.',
    },
    {
      selector: '[data-tour="relatorio-tabela"]',
      content:
        'Lista de todos os atendimentos da gira com nome do consulente, médium, cambone e detalhes do atendimento.',
    },
    {
      selector: '[data-tour="relatorio-export"]',
      content:
        'Exporte o relatório em planilha (CSV) para arquivamento ou análise externa.',
    },
  ],

  '/admin/audit-trail': [
    {
      selector: '[data-tour="audit-header"]',
      content:
        'O histórico de auditoria registra todas as ações realizadas no painel — uma memória completa do que foi feito e por quem.',
    },
    {
      selector: '[data-tour="audit-filtros"]',
      content:
        'Filtre o histórico por tipo de recurso (senhas, giras, usuários) ou por tipo de ação (criação, edição, exclusão).',
    },
    {
      selector: '[data-tour="audit-tabela"]',
      content:
        'Cada linha mostra o que foi alterado, por qual usuário e quando. Clique no ícone de detalhes para ver os valores antes e depois da mudança.',
    },
    {
      selector: '[data-tour="audit-export"]',
      content:
        'Exporte o histórico de auditoria para arquivo (CSV) para fins de controle ou compliance.',
    },
  ],

  '/admin/config': [
    {
      selector: '[data-tour="config-header"]',
      content:
        'Aqui você personaliza como o seu terreiro aparece para os consulentes — na página de emissão de senhas e nos e-mails enviados.',
    },
    {
      selector: '[data-tour="config-branding"]',
      content:
        'Faça o upload do logo do terreiro e defina as cores principais. Essas cores aparecem no painel e nos e-mails das senhas.',
    },
    {
      selector: '[data-tour="config-endereco"]',
      content:
        'Informe o endereço do terreiro. Ele aparece no e-mail da senha como botão "Como chegar" — facilitando para o consulente saber onde é a gira.',
    },
    {
      selector: '[data-tour="config-flags"]',
      content:
        'Ative ou desative funcionalidades do sistema, como entrada presencial (walk-in), operações em lote e webhooks.',
    },
    {
      selector: '[data-tour="config-patrocinador"]',
      content:
        'Escolha como as senhas de patrocinadores são organizadas na fila: todas antes dos demais ou intercaladas com as senhas comuns.',
    },
  ],

  '/admin/plano': [
    {
      selector: '[data-tour="plano-atual"]',
      content:
        'Seu plano atual e os limites vigentes: número de usuários, giras por mês e médiuns cadastrados.',
    },
    {
      selector: '[data-tour="plano-comparativo"]',
      content:
        'Compare os planos disponíveis e veja quais funcionalidades cada um oferece.',
    },
    {
      selector: '[data-tour="plano-upgrade"]',
      content:
        'Para fazer upgrade ou tirar dúvidas sobre os planos, entre em contato diretamente pelo WhatsApp ou e-mail.',
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
