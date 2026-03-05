# Feature Specification: Sistema Multi-Tenant de Gestão de Senhas para Terreiros

**Feature Branch**: `001-multi-tenant-senhas`  
**Created**: 2026-03-05  
**Status**: Draft  
**Input**: User description: "Sistema de Senhas para Terreiros de Umbanda (Multi-tenant por Slug) - Plataforma web completa para controle profissional de senhas de atendimento em giras"

## Clarifications

### Session 2026-03-05

- Q: JWT Token Duration & Refresh Mechanism? → A: Access token 24 horas, refresh token 30 dias (HTTP-only cookie). Frontend com refresh automático via interceptor 5min antes de expiração.
- Q: LGPD Data Retention Period? → A: Configurable por tenant (padrão 12 meses). Soft-delete com pseudonimização de audit_logs. Exclusão processada em 48h via background job.
- Q: API Versioning Strategy? → A: URL Path Versioning (`/api/v1/`, `/api/v2/`). Versão anterior mantida 6 meses com deprecation headers. Backward-compatible changes (novos fields) não requerem versionamento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulente Retira Senha Pública (Priority: P1)

Um consulente acessa o site público do terreiro (sem necessidade de login), visualiza informações sobre a próxima gira disponível, retira sua senha informando dados pessoais obrigatórios (nome, telefone, e-mail), e recebe confirmação imediata visual e por e-mail profissional, garantindo sua posição na fila de atendimento.

**Why this priority**: Esta é a funcionalidade core do sistema - sem ela, não há produto. É o fluxo que entrega valor direto ao usuário final (consulente) e resolve o problema principal: gestão de filas de atendimento substituindo processos manuais por fluxo digital profissional.

**Independent Test**: Pode ser testado completamente acessando `/t/{slug}/senha`, preenchendo o formulário com nome, telefone e e-mail válidos, confirmando recebimento do número de senha na tela e por e-mail. Entrega valor imediato: consulente tem sua senha reservada e confirmada digitalmente.

**Acceptance Scenarios**:

1. **Given** consulente acessa página pública do terreiro que tem gira futura configurada e ainda não esgotou senhas, **When** preenche formulário com nome completo, telefone celular BR válido e e-mail válido, **Then** recebe número de senha sequencial único, vê confirmação visual grande na tela, e recebe e-mail profissional HTML inline com detalhes da senha e da gira

2. **Given** consulente já retirou senha para uma gira específica, **When** tenta retirar nova senha para a mesma gira usando mesmo telefone OU mesmo e-mail, **Then** sistema impede duplicidade, exibe mensagem clara informando que já possui senha, mostra número da senha existente, e oferece opção de reenviar e-mail de confirmação

3. **Given** gira ainda não liberou emissão de senhas (data/hora atual antes de `release_start_at`), **When** consulente acessa página de retirada, **Then** vê contador regressivo até liberação, botão "Retirar senha" fica desabilitado, e interface explica quando a emissão será liberada

4. **Given** gira já esgotou todas as senhas disponíveis (`issued_count >= max_senhas`), **When** consulente acessa página, **Then** vê mensagem clara de esgotamento, contador regressivo até a próxima gira disponível (se existir), e não pode retirar nova senha

5. **Given** gira encerrou janela de emissão (`now > release_end_at`), **When** consulente acessa página, **Then** vê mensagem de encerramento, contador até próxima gira (se houver), e não pode retirar senha

6. **Given** não há nenhuma gira futura configurada para o terreiro, **When** consulente acessa `/t/{slug}`, **Then** vê mensagem configurável do terreiro informando que em breve haverá novo calendário

7. **Given** consulente recebeu sua senha mas perdeu o e-mail, **When** acessa novamente a página usando mesmos dados, **Then** sistema identifica senha existente e oferece botão de reenviar e-mail (com rate limiting de 2/min, 5/hora)

8. **Given** múltiplos consulentes tentam retirar senha simultaneamente para mesma gira, **When** requisições concorrentes são processadas, **Then** cada um recebe número único sequencial sem duplicidades ou race conditions (garantido por transação de banco)

9. **Given** consulente fornece telefone em formato inconsistente (com/sem DDD, com parênteses, espaços), **When** submete formulário, **Then** sistema normaliza automaticamente para formato E.164 (ex: +5516991091234) antes de validar duplicidade

10. **Given** consulente fornece e-mail com letras maiúsculas ou espaços, **When** submete formulário, **Then** sistema normaliza automaticamente para lowercase e trim antes de validar duplicidade

### User Story 2 - Admin Gerencia Calendário e Senhas do Terreiro (Priority: P2)

Administrador do terreiro faz login autenticado, gerencia calendário de giras (CRUD completo), configura controle de senhas para cada gira (quantidade máxima, janela de liberação, modo de exibição do progresso), visualiza lista de consulentes que retiraram senha com filtros e ordenação, e executa ações operacionais (cancelar, reemitir, reenviar e-mail).

**Why this priority**: Funcionalidade essencial para operação do sistema. Sem gestão administrativa, não é possível configurar giras nem controlar o fluxo de senhas. É o segundo pilar mais crítico após a emissão pública, pois habilita que o terreiro opere o sistema de forma independente.

**Independent Test**: Pode ser testado independentemente criando usuário admin, fazendo login em `/app/{slug}/login`, criando gira completa com título/linha/data/hora, configurando controle de senhas (max 50, liberação 7 dias antes, progresso visível), e verificando que gira aparece no público. Entrega valor: terreiro consegue auto-gerenciar seu calendário digitalmente.

**Acceptance Scenarios**:

1. **Given** admin autenticado acessa dashboard do terreiro, **When** navega para seção Giras e clica em "Nova Gira", **Then** preenche formulário (título, linha espiritual, data/hora início, observações opcionais), salva como DRAFT, e gira é criada mas não visível no público

2. **Given** admin criou gira em DRAFT, **When** acessa edição da gira e configura controle de senhas definindo quantidade máxima (ex: 120), data/hora de início de liberação (ex: 7 dias antes da gira), data/hora de fim de liberação (opcional), e modo de exibição de progresso (PERCENT/COUNT/HIDDEN), **Then** configuração é salva, criando registro 1:1 em `senha_controls` vinculado à gira

3. **Given** admin configurou gira e controle de senhas, **When** altera status da gira para PUBLISHED, **Then** gira se torna visível na área pública do terreiro conforme regras de countdown, e consulentes podem começar a retirar senhas quando dentro da janela de liberação

4. **Given** gira publicada com senhas emitidas, **When** admin acessa "Visualizar Senhas" para a gira, **Then** vê lista ordenada por número de senha crescente, exibindo: número, nome normalizado, telefone E.164, e-mail lowercase, data/hora de emissão, status atual, IP de origem

5. **Given** admin visualiza lista de senhas, **When** aplica filtro por status (RESERVED, CANCELLED, etc) ou busca por nome/telefone/e-mail parcial, **Then** lista é filtrada em tempo real mostrando apenas registros correspondentes

6. **Given** admin visualiza lista de senhas, **When** clica em "Exportar CSV", **Then** recebe arquivo download com todas as colunas relevantes (número, nome, telefone, e-mail, data emissão, status) para uso externo ou backup

7. **Given** admin identifica consulente que não comparecerá, **When** seleciona ticket e clica "Cancelar Senha", **Then** status do ticket muda para CANCELLED, número permanece registrado no histórico (não é reutilizado), e ação é registrada em audit_logs com identificação do admin e timestamp

8. **Given** admin cancelou senha de consulente por engano e consulente está presente, **When** seleciona ticket cancelado e clica "Reemitir Senha", **Then** sistema gera NOVO ticket com NOVO número no final da fila (preservando ordem original), desde que não tenha atingido `max_senhas`

9. **Given** gira já atingiu `max_senhas` e admin tenta reemitir senha, **When** clica em "Reemitir", **Then** sistema bloqueia ação e exibe mensagem clara explicando que capacidade máxima foi atingida e não é possível reemitir

10. **Given** consulente relata que não recebeu e-mail, **When** admin encontra ticket do consulente e clica "Reenviar E-mail", **Then** sistema reenvia e-mail de confirmação com mesmas informações, respeitando rate limiting (5 reenvios/hora por ticket, configurável), e registra ação em audit_logs

11. **Given** admin acessa configurações de branding do terreiro, **When** faz upload de logo (PNG/JPG) e define cores primária/secundária/fundo/texto em formato hexadecimal, **Then** configurações são salvas na tabela `tenants` e aplicadas automaticamente em todas as páginas públicas e e-mails do terreiro

12. **Given** todas as ações administrativas críticas (publicar gira, cancelar senha, reemitir, editar controle), **When** executadas, **Then** são registradas em `audit_logs` com: tenant_id, actor_user_id, action (string descritiva), entity_type, entity_id, metadata (JSON com detalhes da alteração), created_at (UTC)

### User Story 3 - Super Admin Gerencia Plataforma Multi-Tenant (Priority: P3)

Super administrador da plataforma faz login em área dedicada, cadastra novos terreiros definindo slugs únicos e criando usuários administradores iniciais com senhas temporárias, visualiza auditoria global consolidada de todos os tenants, e gerencia configurações de branding centralizadamente caso necessário.

**Why this priority**: Funcionalidade que transforma o sistema em produto comercial escalável. Permite onboarding de múltiplos terreiros sem necessidade de modificações no código ou banco de dados. É P3 porque depende de P1 e P2 estarem funcionando, mas é essencial para viabilidade comercial do negócio.

**Independent Test**: Pode ser testado criando usuário SUPER_ADMIN global, fazendo login em `/platform/login`, cadastrando novo terreiro com slug "exemplo-sp", criando admin inicial com e-mail/senha, e verificando que admin pode logar em `/app/exemplo-sp/login` e gerenciar seu terreiro independentemente. Entrega valor: plataforma pode adicionar novos clientes sem retrabalho técnico.

**Acceptance Scenarios**:

1. **Given** super admin autenticado acessa dashboard da plataforma, **When** naviga para "Terreiros" e clica em "Cadastrar Novo Terreiro", **Then** preenche formulário (slug único, nome do terreiro, timezone padrão América/São_Paulo, mensagem quando sem giras, URL política de privacidade opcional), e terreiro é criado na tabela `tenants`

2. **Given** super admin está cadastrando novo terreiro, **When** tenta usar slug que já existe no sistema, **Then** validação bloqueia submissão e exibe erro claro informando que slug deve ser único em toda a plataforma

3. **Given** super admin criou novo terreiro, **When** define branding inicial (logo URL, cores primária/secundária/fundo/texto em hexadecimal), **Then** configurações são salvas e aplicadas automaticamente a todas as páginas públicas e e-mails daquele tenant

4. **Given** super admin criou terreiro, **When** cadastra usuário administrador inicial do terreiro fornecendo nome e e-mail, **Then** sistema gera senha temporária aleatória forte, cria registro em `users` com role ADMIN e tenant_id correto, e exibe senha temporária para super admin repassar ao cliente (e opcional: envia por e-mail seguro)

5. **Given** super admin cadastrou admin inicial de terreiro com senha temporária, **When** admin inicial faz primeiro login, **Then** sistema força alteração de senha antes de liberar acesso ao dashboard (fluxo de primeiro acesso)

6. **Given** super admin acessa auditoria global da plataforma, **When** visualiza logs consolidados, **Then** vê todas as ações críticas de todos os tenants em lista unificada, podendo filtrar por tenant_id, actor_user_id, action, entity_type, período de data, com paginação para performance

7. **Given** super admin identifica tenant que precisa ajustar branding, **When** acessa configurações do tenant e edita logo ou cores, **Then** alterações são aplicadas imediatamente e registradas em audit_logs com identificação do super admin que fez a modificação

8. **Given** super admin precisa investigar problema operacional de um terreiro, **When** filtra audit_logs por tenant_id specific, **Then** vê histórico completo de ações daquele tenant isoladamente, facilitando troubleshooting e suporte

9. **Given** super admin visualiza lista de terreiros cadastrados, **When** clica em terreiro específico, **Then** vê dashboard resumido: quantidade de giras criadas, senhas emitidas totais, usuarios admin/operator cadastrados, data de criação do tenant, último login de admin

10. **Given** super admin precisa pausar operação de um terreiro por motivo administrativo, **When** edita tenant e marca flag `is_active = false`, **Then** todas as páginas públicas e administrativas do slug daquele tenant exibem mensagem de manutenção temporária e bloqueiam novas operações

### User Story 4 - UI/UX Padronizada com MUI e Branding por Tenant (Priority: P2)

Todas as interfaces públicas e administrativas seguem padrão consistente usando Material UI com AppBar, Drawer lateral, menus de perfil e footer, aplicando tema neutro por padrão e sobrepondo cores e logo do tenant dinamicamente quando em contexto de terreiro específico, garantindo experiência profissional e reconhecimento visual imediato.

**Why this priority**: Define a identidade visual e profissionalismo do produto. Experiência consistente e branded aumenta confiança do usuário e diferencia a plataforma de soluções amadoras. É P2 porque impacta diretamente a percepção de qualidade mesmo sendo "apenas" UI.

**Independent Test**: Pode ser testado navegando em `/t/{slug}` e verificando que logo e cores primárias/secundárias do tenant são aplicadas (header, botões, links), depois navegando em área `/platform/` e verificando que tema neutro padrão é usado (cinzas), e finalmente testando responsividade mobile com drawer temporário. Entrega valor: consistência visual e profissionalismo perceptível.

**Acceptance Scenarios**:

1. **Given** usuário acessa qualquer página do sistema, **When** visualiza interface, **Then** vê AppBar (header) fixo no topo com logo apropriado (tenant ou plataforma), título da seção atual, e menu de perfil/avatar no canto direito (se autenticado)

2. **Given** admin autenticado acessa dashboard em desktop, **When** visualiza layout, **Then** vê Drawer lateral permanente à esquerda com navegação organizada (Dashboard, Giras, Senhas, Branding, Usuários, Auditoria), área de conteúdo principal à direita, e footer simples na parte inferior

3. **Given** admin autenticado acessa dashboard em mobile, **When** visualiza layout, **Then** Drawer fica oculto por padrão, AppBar exibe ícone de menu hamburger que abre Drawer temporário sobreposto ao conteúdo, e fecha automaticamente ao selecionar item

4. **Given** usuário autenticado clica no avatar/menu de perfil no AppBar, **When** menu dropdown abre, **Then** vê opções: "Meu Perfil" (editar dados pessoais, alterar senha), "Sair" (logout), e opcionalmente "Ajuda/Documentação"

5. **Given** usuário acessa páginas públicas de tenant específico (ex: `/t/exemplo-sp/senha`), **When** interface carrega, **Then** logo do terreiro é exibida no header, cores primária e secundária definidas pelo tenant são aplicadas em botões/links/progress bar, background e cores de texto respeitam configuração do tenant, e rodapé pode incluir link para política de privacidade do tenant

6. **Given** super admin acessa área da plataforma (ex: `/platform/tenants`), **When** interface carrega, **Then** tema neutro padrão é aplicado (tons de cinza, azul neutro para primária), logo genérica da plataforma é exibida, sem branding de tenant específico

7. **Given** tenant não configurou cores customizadas (campos `primary_color`, `secondary_color` null), **When** páginas do tenant carregam, **Then** sistema usa paleta padrão neutra sem erro, garantindo funcionamento mesmo sem branding configurado

8. **Given** tenant fez upload de logo mas imagem está inacessível (URL quebrada), **When** página tenta carregar logo, **Then** fallback é exibido (iniciais do nome do terreiro, ou logo placeholder genérica) sem quebrar layout

9. **Given** usuário navega entre diferentes páginas do mesmo contexto (ex: público de um tenant), **When** muda de rota, **Then** branding permanece consistente (mesma logo, mesmas cores), transições são suaves, e AppBar/Drawer não "piscam" ou recarregam

10. **Given** consulente acessa homepage comercial da plataforma em `/`, **When** visualiza página, **Then** vê seções: Hero com proposta de valor, Cards de benefícios, Stepper "Como funciona", FAQ, Footer com link WhatsApp para contato comercial (`https://wa.me/5516991091234`), e botões "Acessar área administrativa"

### Edge Cases

- O que acontece quando tenant exclui logo mas ainda há referência no banco?  
  Sistema deve usar fallback (iniciais ou logo genérica) sem quebrar UI

- Como sistema lida com tentativas de acessar slug inexistente (ex: `/t/slug-invalido`)?  
  Retorna página 404 customizada informando que terreiro não foi encontrado

- O que acontece se admin tentar publicar gira sem configurar controle de senhas?  
  Sistema deve bloquear ação e exibir erro requerendo que configure controle antes de publicar

- Como sistema garante que numeração sequencial não pula números mesmo com transações concorrentes?  
  Usa `SELECT ... FOR UPDATE` em `senha_controls.current_number` dentro de transação com isolamento adequado (REPEATABLE READ ou SERIALIZABLE)

- O que acontece se e-mail transacional falha ao enviar (serviço de mail fora do ar)?  
  Sistema registra erro em `audit_logs` com metadata JSON incluindo erro específico, exibe mensagem ao usuário que senha foi criada mas e-mail pode ter atrasado, e oferece reenvio manual

- Como sistema previne que admin de um tenant acesse dados de outro tenant?  
  Todas as queries no backend filtram obrigatoriamente por `tenant_id` extraído do JWT do usuário autenticado, evitando vazamento cross-tenant

- O que acontece se dois admins tentam cancelar mesma senha simultaneamente?  
  Segunda tentativa deve retornar mensagem informando que senha já foi cancelada, registrando ambas as tentativas em audit_logs

- Como sistema lida com timezone quando gira é configurada e consulentes estão em fusos diferentes?  
  Todas as datas são armazenadas em UTC no banco (`timestamptz`), convertidas para timezone do tenant (`tenants.timezone`) ao exibir no público, e countdown considera timezone do tenant

- O que acontece se admin tenta reemitir senha para gira que já está em status DONE ou CANCELLED?  
  Sistema bloqueia ação com mensagem clara explicando que reemissão só é permitida para giras PUBLISHED

- Como sistema previne múltiplas submissões rápidas do mesmo consulente (double-click no botão)?  
  Frontend desabilita botão após primeiro click, backend valida idempotência por unique constraint de (gira_id + phone_e164 + email_lower), retornando ticket existente sem erro se duplicidade detectada

## Requirements *(mandatory)*

### Functional Requirements

**Isolamento Multi-Tenant e Segurança**

- **FR-001**: Sistema DEVE identificar cada terreiro por slug único e imutável em toda a plataforma
- **FR-002**: Todas as tabelas multi-tenant DEVEM incluir coluna `tenant_id` (FK para `tenants.id`)
- **FR-003**: Todas as queries e operações de banco DEVEM filtrar obrigatoriamente por `tenant_id` para prevenir vazamento cross-tenant
- **FR-004**: Acesso administrativo DEVE exigir autenticação via JWT com refresh token seguro armazenado em HTTP-only cookie. **[CLARIFIED]** Access token válido por 24 horas, refresh token válido por 30 dias. Sistema renova access token automaticamente ao detectar expiração (antes de rejeitar requisição com 401).
- **FR-004a**: Frontend DEVE implementar refresh automático: interceptor no cliente detecta access token expirando em menos de 5 minutos e solicita novo token via endpoint `/auth/refresh` sem exigir re-login do usuário.
- **FR-005**: Perfis de usuário DEVEM ter permissões granulares: SUPER_ADMIN (gestão plataforma), ADMIN (CRUD giras/senhas do tenant), OPERATOR (visualização apenas)
- **FR-006**: Senhas de usuários administrativos DEVEM ser hasheadas usando bcrypt ou argon2 (nunca plain text)
- **FR-007**: Dados pessoais (nome, telefone, e-mail) DEVEM ser criptografados em trânsito via HTTPS obrigatório
- **FR-008**: APIs públicas DEVEM implementar rate limiting: 5 req/min por IP em emissão de senha, 2 req/min em reenvio de e-mail por ticket

**Gestão de Giras e Controle de Senhas**

- **FR-009**: Admin DEVE poder criar gira informando título, linha espiritual, data/hora de início, observações opcionais, e status inicial DRAFT
- **FR-010**: Cada gira DEVE ter relacionamento 1:1 obrigatório com registro de `senha_controls` antes de ser publicada
- **FR-011**: Configuração de senha_controls DEVE incluir: quantidade máxima de senhas, data/hora de início de liberação, data/hora de fim de liberação (opcional), modo de exibição de progresso (PERCENT|COUNT|HIDDEN)
- **FR-012**: Admin DEVE poder alterar status de gira para: DRAFT (editável, não visível publicamente), PUBLISHED (visível e operacional), CANCELLED (cancelada mas mantém histórico), DONE (finalizada após realização)
- **FR-013**: Sistema DEVE impedir publicação de gira sem `senha_controls` configurado, exibindo mensagem clara de validação
- **FR-014**: Admin DEVE visualizar lista de todas as giras do tenant com filtros por status e período de data

**Emissão Pública de Senhas (Fluxo Core)**

- **FR-015**: Consulente DEVE retirar senha informando obrigatoriamente: nome completo, telefone celular BR, e-mail válido
- **FR-016**: Sistema DEVE normalizar automaticamente dados antes de validar: telefone para formato E.164 (ex: +5516991091234), e-mail para lowercase com trim, nome com trim e colapso de espaços múltiplos
- **FR-017**: Sistema DEVE impedir que mesma pessoa retire mais de uma senha para mesma gira, usando constraint unique em (tenant_id, gira_id, phone_e164, email_lower)
- **FR-018**: Sistema DEVE gerar números de senha sequenciais únicos por gira (1..N) de forma atômica usando transação com `SELECT ... FOR UPDATE` em `senha_controls.current_number`
- **FR-019**: Sistema DEVE garantir zero race conditions em emissões concorrentes, assegurando que cada número seja emitido exatamente uma vez
- **FR-020**: Sistema DEVE criar registro de `consulente` se não existir (por tenant_id + phone_e164 + email_lower), ou reutilizar existente
- **FR-021**: Sistema DEVE criar ticket vinculando consulente à gira com número sequencial, status RESERVED, IP de origem, user agent, timestamp UTC de emissão
- **FR-022**: Sistema DEVE enviar e-mail de confirmação automaticamente após emissão bem-sucedida, registrando timestamp de envio em `email_sent_at`
- **FR-023**: Se consulente tentar retirar senha novamente para mesma gira, sistema DEVE identificar ticket existente e retornar idempotentemente sem criar duplicata, oferecendo reenvio de e-mail

**Countdown e Visualização de Progresso**

- **FR-024**: Página pública DEVE exibir contador regressivo até abertura de liberação quando `now < release_start_at`, bloqueando botão de retirada
- **FR-025**: Página pública DEVE exibir mensagem de esgotamento quando `issued_count >= max_senhas`, mostrando contador até próxima gira (se existir)
- **FR-026**: Página pública DEVE exibir mensagem de encerramento quando `release_end_at` foi ultrapassado, mostrando contador até próxima gira
- **FR-027**: Quando não há gira futura configurada para o tenant, sistema DEVE exibir mensagem customizável do tenant (`tenants.message_no_next_gira`)
- **FR-028**: Progresso de emissão DEVE ser exibido conforme configuração: PERCENT (ex: "70%"), COUNT (ex: "84/120"), ou HIDDEN (não exibe para público, apenas admin)

**Ações Administrativas Operacionais**

- **FR-029**: Admin DEVE visualizar lista ordenada de senhas por número crescente, exibindo: número, nome, telefone E.164, e-mail, data/hora emissão, status, IP origem
- **FR-030**: Admin DEVE poder filtrar lista por status (RESERVED, CANCELLED, CHECKED_IN, NO_SHOW) e buscar por nome/telefone/e-mail parcial
- **FR-031**: Admin DEVE poder exportar lista de senhas em formato CSV com todas as colunas relevantes
- **FR-032**: Admin DEVE poder cancelar senha de consulente, alterando status para CANCELLED mas mantendo número no histórico (sem reutilização)
- **FR-033**: Admin DEVE poder reemitir senha para consulente (após cancelamento ou no-show), gerando NOVO ticket com NOVO número no final da fila, DESDE QUE `current_number < max_senhas`
- **FR-034**: Sistema DEVE bloquear reemissão quando capacidade máxima foi atingida, exibindo mensagem clara ao admin
- **FR-035**: Admin DEVE poder reenviar e-mail de confirmação manualmente para consulente, respeitando rate limiting configurável (ex: 5 reenvios/hora por ticket)
- **FR-036**: Todas as ações críticas (publicar gira, cancelar senha, reemitir, editar controle, reenviar e-mail) DEVEM ser registradas em `audit_logs` com: tenant_id, actor_user_id, action, entity_type, entity_id, metadata JSON, created_at UTC

**Branding e Identidade Visual por Tenant**

- **FR-037**: Cada tenant DEVE poder configurar: logo (URL de imagem), cores primária/secundária/fundo/texto (hexadecimal)
- **FR-038**: Sistema DEVE aplicar branding do tenant em todas as páginas públicas (rotas `/t/{slug}`) e e-mails transacionais
- **FR-039**: Sistema DEVE usar tema neutro padrão (cinzas) em páginas da plataforma (rotas `/platform/`) sem branding de tenant
- **FR-040**: Se logo do tenant estiver inacessível ou não configurada, sistema DEVE usar fallback (iniciais ou logo genérica) sem quebrar layout
- **FR-041**: Admin do tenant DEVE poder fazer upload de logo e editar paleta de cores via interface administrativa, com preview em tempo real

**Gestão Multi-Tenant pela Plataforma**

- **FR-042**: Super admin DEVE poder cadastrar novo terreiro informando: slug único, nome, timezone (padrão América/São_Paulo), mensagem quando sem giras, URL política privacidade
- **FR-043**: Sistema DEVE validar unicidade de slug em toda a plataforma, bloqueando criação com slug duplicado
- **FR-044**: Super admin DEVE poder criar usuário admin inicial de novo tenant com senha temporária gerada automaticamente
- **FR-045**: Admin inicial DEVE ser forçado a alterar senha temporária no primeiro login antes de acessar dashboard
- **FR-046**: Super admin DEVE visualizar auditoria global consolidada de todos os tenants com filtros por tenant, actor, action, período
- **FR-047**: Super admin DEVE poder editar branding de qualquer tenant centralizadamente caso necessário para suporte
- **FR-048**: Super admin DEVE poder pausar operação de tenant alterando flag `is_active`, bloqueando acesso público e administrativo com mensagem de manutenção

**E-mail Transacional Profissional**

- **FR-049**: E-mail de confirmação DEVE usar template HTML inline (CSS embutido, sem `<style>` externo) para compatibilidade com provedores
- **FR-050**: E-mail DEVE incluir: logo do terreiro, número de senha em destaque visual, título da gira, linha espiritual, data/hora da gira, observações, dados do consulente, aviso LGPD com link para política privacidade do tenant
- **FR-051**: Assunto do e-mail DEVE seguir padrão: "Sua senha para {gira_title} - Nº {numero}"
- **FR-052**: Sistema DEVE registrar tentativas de envio, sucessos e falhas em `audit_logs` ou tabela específica de e-mail tracking
- **FR-053**: Se serviço de e-mail falhar, sistema DEVE continuar operação (senha é emitida), registrar erro detalhado, e oferecer reenvio manual ao consulente

**Conformidade LGPD**

- **FR-054**: Formulário público DEVE incluir checkbox obrigatório de consentimento para tratamento de dados pessoais conforme LGPD
- **FR-055**: Sistema DEVE registrar timestamp de consentimento em `tickets.consent_at` ao emitir senha
- **FR-056**: Cada tenant DEVE poder configurar URL de política de privacidade própria, exibida em formulário e e-mail
- **FR-057**: Sistema DEVE permitir que consulente solicite exclusão de dados pessoais (direito ao esquecimento), removendo dados conforme legislação. **[CLARIFIED]** Retenção padrão é 12 meses após data da gira; super admin pode configurar retenção customizada por tenant (6-24 meses). Exclusão é via soft-delete ou pseudonimização; audit_logs associados mantêm apenas ID anônimo da ação (não nome/contato).
- **FR-057a**: Sistema DEVE disponibilizar formulário de solicitação de exclusão acessível a consulentes (endpoint `/t/{slug}/privacy/deletion-request`), requerendo apenas e-mail de confirmação. Exclusão é processada em background job em até 48 horas.

### Key Entities

- **Tenant (Terreiro)**: Representa um terreiro (cliente da plataforma). Atributos: slug único, nome, branding (logo, cores), timezone, mensagens customizáveis, política privacidade. Relaciona-se 1:N com giras, usuários, consulentes, tickets. Isolamento total entre tenants.

- **User (Usuário Administrativo)**: Representa admin ou operator de tenant, ou super admin da plataforma. Atributos: nome, e-mail, password_hash, role (SUPER_ADMIN/ADMIN/OPERATOR), is_active, last_login_at. Relaciona-se N:1 com tenant (null para SUPER_ADMIN global). Autenticação via JWT.

- **Gira**: Evento de atendimento espiritual em terreiro. Atributos: título, linha espiritual, data/hora início, observações, status (DRAFT/PUBLISHED/CANCELLED/DONE). Relaciona-se N:1 com tenant, 1:1 com senha_control, 1:N com tickets. Visível no público apenas quando PUBLISHED e dentro das regras de countdown.

- **Senha Control**: Configuração de controle de emissão de senhas para gira específica. Atributos: quantidade máxima, número atual emitido (incremental atômico), janela de liberação (start/end datetime), modo de exibição de progresso. Relaciona-se 1:1 obrigatório com gira. É o coração da lógica de emissão e concorrência.

- **Consulente**: Pessoa que retira senha para atendimento. Atributos: nome, nome normalizado, telefone E.164, e-mail lowercase. Relaciona-se N:1 com tenant, 1:N com tickets. Pode ter múltiplos tickets ao longo do tempo para giras diferentes, mas apenas 1 por gira.

- **Ticket (Senha)**: Reserva de posição de atendimento. Atributos: número sequencial (único por gira), status (RESERVED/CANCELLED/CHECKED_IN/NO_SHOW), timestamps (emissão, consentimento, e-mail enviado), IP origem, user agent. Relaciona-se N:1 com tenant, gira, consulente. Constraint unique em (tenant_id, gira_id, numero) e (tenant_id, gira_id, consulente_id).

- **Audit Log**: Registro de auditoria de ações críticas. Atributos: tenant_id (null para ações cross-tenant), actor_user_id (quem fez), action (string descritiva), entity_type/entity_id (o que foi afetado), metadata (JSON com detalhes), created_at UTC. Relaciona-se N:1 com tenant e user. Imutável após criação, para rastreabilidade e compliance.

## API Contract Requirements & Versioning

**URL Path Versioning [CLARIFIED]**

Sistema DEVE implementar versionamento explícito de endpoints via URL path para suportar evolução sem quebrar integradores. Versão atual é `v1`.

- **FR-API-001**: Todos os endpoints DEVEM incluir versão explícita no path: `/api/v1/`, `/api/v2/`, etc
- **FR-API-002**: Estrutura de rotas versionadas:
  - Público: `POST /api/v1/public/tenants/{slug}/tickets` (emissão)
  - Autenticação: `POST /api/v1/auth/login` (global, não-versionado em primário)
  - Admin: `GET /api/v1/admin/{slug}/giras` (gestão do tenant)
  - Super Admin: `POST /api/v1/platform/tenants` (gestão plataforma)
  
- **FR-API-003**: Quebras de compatibilidade (mudanças em contrato request/response, remoção de campos obrigatórios) DEVEM resultar em novo versionamento (ex: `v1` → `v2`)
- **FR-API-004**: Versão anterior DEVE ser mantida operacional por mínimo 6 meses após lançamento de versão nova, com headers de deprecação: `Deprecation: true`, `Sunset: <date>`, `Link: </api/v2/endpoint>; rel="successor"`
- **FR-API-005**: Adições **backward-compatible** (novos campos em response, novos query params opcionais, novos valores de enum) NÃO requerem versionamento, podem acontecer dentro de mesma versão (`v1`)
- **FR-API-006**: Clientes (web app, integradores) DEVEM ignorar campos desconhecidos em responses para tolerância a adições futuras dentro da mesma versão
- **FR-API-007**: Documentação de API (OpenAPI/Swagger) DEVE ser mantida com exemplos para versão atual (v1) e versão anterior+1 (se aplicável), com notas de deprecação

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Consulente consegue retirar senha completa (ver número e receber e-mail) em menos de 60 segundos a partir do acesso à página pública, em 95% dos casos (medido por analytics de tempo de sessão)

- **SC-002**: Sistema suporta 50 emissões de senha simultâneas para mesma gira sem gerar duplicidade de números ou falhas de transação (validado por teste de carga com concorrência)

- **SC-003**: Zero duplicidades de número de senha por gira em produção após 1000 senhas emitidas em múltiplas giras (validado por query de integridade no banco)

- **SC-004**: Taxa de entrega de e-mail de confirmação acima de 95% (medido por logs de envio bem-sucedido vs tentativas totais, excluindo e-mails inválidos)

- **SC-005**: Admin consegue criar gira completa (dados + controle de senhas + publicar) em menos de 3 minutos, em 90% dos casos (medido por tempo entre início de criação e publicação)

- **SC-006**: 100% das ações críticas (publicar gira, cancelar senha, reemitir, reenviar e-mail) são registradas em audit_logs com todos os campos obrigatórios preenchidos (validado por query de integridade)

- **SC-007**: Sistema bloqueia 100% das tentativas de retirar segunda senha para mesma gira com mesmo telefone OU e-mail, retornando idempotentemente ticket existente (validado por testes automatizados)

- **SC-008**: Interface pública é responsiva e utilizável em mobile (viewport mínimo 320px) sem quebras de layout ou funcionalidades inacessíveis (validado por testes de responsividade)

- **SC-009**: Branding do tenant (logo e cores) é aplicado corretamente em 100% das páginas públicas e e-mails, sem fallback visual por erro de configuração (validado por testes de rendering)

- **SC-010**: Super admin consegue cadastrar novo terreiro completo (tenant + admin inicial) e torná-lo operacional em menos de 5 minutos (validado por walkthrough de onboarding)

- **SC-011**: Taxa de tentativas de acesso cross-tenant bloqueadas é 100% (nenhum admin consegue acessar dados de tenant diferente do seu), validado por testes de penetração de permissões

- **SC-012**: Sistema mantém disponibilidade de 99.5% durante horário comercial (9h-18h BRT), medido por uptime monitoring externo

- **SC-013**: Tempo de resposta da API de emissão de senha (POST /public/tenants/{slug}/tickets) é inferior a 500ms em p95 sob carga normal (até 10 req/s), medido por APM

- **SC-014**: Countdown e indicador de progresso são atualizados em tempo real (máximo 5s de delay) após emissão de cada senha, perceptível pelo consulente (validado por testes de usabilidade)

- **SC-015**: Taxa de satisfação dos administradores com fluxo de gestão de giras e senhas é superior a 80% após 1 mês de uso, medido por pesquisa NPS ou similar

## Assumptions

- Sistema assume que cada terreiro opera em timezone fixo (padrão América/São_Paulo), configurável no cadastro mas sem suporte a múltiplos timezones por tenant

- Sistema assume que telefone é sempre Brasil (+55), aplicando formatação E.164 brasileira; expansão internacional requer ajuste de validação

- Sistema assume que e-mail é único por pessoa no contexto de um tenant (mesma pessoa pode usar e-mails diferentes em tenants diferentes tecnicamente, mas é desencorajado)

- Sistema assume que serviço de e-mail transacional (Brevo/Resend) tem disponibilidade mínima de 99%, com fallback manual de reenvio se falhar

- Sistema assume que VPS tem capacidade suficiente para hospedar PostgreSQL localmente sem necessidade de serviço gerenciado externo inicialmente

- Sistema assume que volumetria inicial é de até 100 giras/mês por tenant e 200 senhas/gira em média, com crescimento gradual; escalabilidade horizontal não é requerida no MVP

- Sistema assume que logo do tenant é hospedada externamente (URL) e não requer upload/storage gerenciado pelo sistema (pode ser adicionado futuramente)

- Sistema assume que política de privacidade do tenant é gerenciada externamente (link para página própria), sem necessidade de editor in-app no MVP

- Sistema assume que rate limiting básico por IP é suficiente para MVP; proteção avançada contra bots (CAPTCHA) pode ser adicionada posteriormente se necessário

- Sistema assume que admin inicial de cada tenant é criado manualmente pelo super admin; auto-cadastro de terreiros não está no escopo do MVP

## Out of Scope (Explicitly NOT Included)

- **Pagamentos e assinaturas**: MVP não inclui cobrança automatizada, planos pagos ou gateway de pagamento; terreiros são cadastrados manualmente

- **Notificações push ou SMS**: Apenas e-mail é suportado; notificações mobile via app nativo ou SMS estão fora de escopo

- **Check-in automatizado com QR Code**: Funcionalidade de check-in manual existe, mas geração e leitura de QR code está fora de escopo do MVP

- **Integração com calendários externos (Google Calendar, Outlook)**: Giras são gerenciadas apenas internamente no sistema

- **Multi-idioma**: Sistema é desenvolvido em português brasileiro; internacionalização (i18n) está fora de escopo

- **Chat ou suporte in-app**: Suporte é feito via WhatsApp externo; chat integrado não está incluído

- **Analytics avançado ou dashboards customizáveis**: Dashboard é fixo com métricas básicas; analytics detalhado e customização estão fora de escopo

- **App mobile nativo (iOS/Android)**: Sistema é web responsivo; apps nativos estão fora de escopo

- **Integração com redes sociais (Facebook, Instagram)**: Não há auto-posting ou integração com social media no MVP

- **Relatórios personalizados e BI**: Exportação CSV básica está incluída; relatórios avançados e BI estão fora de escopo

- **Gestão de múltiplos endereços por tenant**: Assume-se um endereço físico por terreiro; multi-localização está fora de escopo

- **Funcionalidade de "lista de espera" quando senhas esgotam**: Esgotou = bloqueado; sistema de waitlist não está incluído

## Notes

- Stack técnica definida pela constituição: Frontend Next.js + MUI, Backend FastAPI + PostgreSQL, E-mail via Brevo/Resend

- Design patterns: Todos os endpoints multi-tenant devem extrair `tenant_id` do contexto (slug na URL pública, JWT nas áreas autenticadas) e aplicar filtro automático

- Importante: Transação de emissão de senha é ponto crítico de concorrência; implementação deve usar `SELECT ... FOR UPDATE` obrigatoriamente

- E-mails devem usar HTML inline (table-based, CSS inline) para máxima compatibilidade; testar em Gmail, Outlook, Yahoo antes de produção

- Rate limiting deve estar ativo desde MVP para prevenir abuso; valores configuráveis mas defaults sugeridos: 5 req/min emissão, 2 req/min reenvio

- Auditoria é não-negociável conforme constituição (Princípio V); implementar desde início evitando refactor posterior

- Considerar usar feature flag para funcionalidades como check-in/no-show que podem ser opcionais por tenant inicialmente

- Homepage comercial (`/`) deve ser simples mas profissional; templates MUI prontos podem acelerar desenvolvimento

- Timezone handling: armazenar sempre UTC no banco, converter para timezone do tenant apenas na apresentação (frontend e e-mail)

- Normalização de dados (telefone E.164, e-mail lowercase) deve acontecer no backend consistentemente; frontend pode ter masks mas backend valida e normaliza sempre
