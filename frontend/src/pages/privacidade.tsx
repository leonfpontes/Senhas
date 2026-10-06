/**
 * Girahub — Política de Privacidade
 */
import React from 'react';
import { LegalPageLayout } from '@/components/public/LegalPageLayout';

// ─── Legal sections ──────────────────────────────────────────────
const SECTIONS = [
  {
    title: '1. Dados que Coletamos',
    body: `Coletamos os seguintes tipos de dados pessoais:

• **Dados de cadastro:** nome, e-mail, telefone e informações do terreiro (nome, endereço) ao criar uma conta administrativa.
• **Dados de consulentes:** nome e e-mail fornecidos voluntariamente ao emitir uma senha para participação em giras.
• **Dados de uso:** páginas acessadas, horários de acesso, ações realizadas no painel administrativo (registradas em trilha de auditoria).
• **Dados técnicos:** endereço IP, tipo de navegador e sistema operacional, coletados automaticamente para garantir segurança e desempenho.
• **Dados de comunicação:** conteúdo de e-mails enviados pela plataforma (confirmações de senha, notificações).`,
  },
  {
    title: '2. Finalidade do Uso dos Dados',
    body: `Utilizamos seus dados para:

• Prover e manter o funcionamento da plataforma Girahub.
• Emitir, reenviar e gerenciar senhas para giras.
• Enviar confirmações e notificações por e-mail aos consulentes e administradores.
• Manter a trilha de auditoria de operações para segurança e conformidade.
• Gerar relatórios e analytics agregados para os administradores do terreiro.
• Melhorar a experiência do usuário e a segurança da plataforma.`,
  },
  {
    title: '3. Isolamento Multi-Tenant',
    body: `O Girahub opera com arquitetura multi-tenant, garantindo isolamento total dos dados entre diferentes terreiros. Isso significa que:

• Cada terreiro (tenant) possui um identificador único atrelado a todos os seus dados.
• A autenticação via JWT carrega o identificador do tenant no payload.
• Toda consulta ao banco de dados filtra obrigatoriamente pelo tenant, impedindo acesso cruzado entre organizações.
• Administradores de um terreiro jamais têm acesso aos dados de outro terreiro.`,
  },
  {
    title: '4. Armazenamento e Segurança',
    body: `Adotamos as seguintes medidas de segurança:

• **Criptografia em trânsito:** toda comunicação entre seu navegador e nossos servidores utiliza HTTPS/TLS.
• **Senhas protegidas:** senhas de acesso são armazenadas com hash bcrypt, nunca em texto puro.
• **Controle de acesso (RBAC):** permissões diferenciadas por papel (Super Admin, Administrador, Operador).
• **Trilha de auditoria:** todas as operações sensíveis são registradas com data, hora, usuário e ação realizada.
• **Monitoramento contínuo:** a plataforma conta com monitoramento 24/7 para detecção de anomalias.`,
  },
  {
    title: '5. Compartilhamento de Dados',
    body: `Não vendemos, alugamos ou compartilhamos seus dados pessoais para fins de marketing. Dados podem ser compartilhados apenas nos seguintes casos:

• **Provedores de e-mail:** utilizamos serviços de envio de e-mail (ex.: Brevo, Resend) exclusivamente para entregar notificações e confirmações da plataforma.
• **Obrigação legal:** quando exigido por lei, ordem judicial ou autoridade reguladora competente.
• **Proteção de direitos:** para proteger os direitos, propriedade ou segurança do Girahub, de nossos usuários ou do público.`,
  },
  {
    title: '6. Seus Direitos (LGPD — Art. 18)',
    body: `De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:

• **Confirmação e acesso:** saber se tratamos seus dados e acessar uma cópia.
• **Correção:** solicitar a correção de dados incompletos, inexatos ou desatualizados.
• **Anonimização ou eliminação:** solicitar a anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos.
• **Portabilidade:** solicitar a portabilidade de seus dados a outro fornecedor de serviço.
• **Revogação do consentimento:** retirar seu consentimento a qualquer momento, sem prejuízo ao tratamento realizado anteriormente.
• **Informação:** ser informado sobre entidades públicas e privadas com as quais compartilhamos dados.
• **Oposição:** opor-se ao tratamento quando realizado em descumprimento à LGPD.

Para exercer qualquer destes direitos, entre em contato pelo e-mail leonfpontes@gmail.com.`,
  },
  {
    title: '7. Cookies e Tecnologias de Rastreamento',
    body: `O Girahub utiliza apenas cookies essenciais para o funcionamento da plataforma:

• **Cookies de sessão:** para manter sua autenticação ativa durante o uso do painel.
• **Cookies de preferência:** para lembrar configurações de interface como tema e idioma.

Não utilizamos cookies de publicidade, rastreamento de terceiros ou ferramentas de marketing comportamental.`,
  },
  {
    title: '8. Retenção de Dados',
    body: `• **Dados de conta:** mantidos enquanto sua conta estiver ativa. Após solicitação de exclusão, dados são removidos em até 30 dias.
• **Dados de auditoria:** mantidos por 12 meses para fins de segurança e conformidade, sendo eliminados automaticamente após este período.
• **Dados de consulentes:** mantidos enquanto o terreiro associado mantiver conta ativa. Podem ser eliminados a pedido do consulente ou do administrador do terreiro.`,
  },
  {
    title: '9. Menores de Idade',
    body: `A plataforma Girahub não é direcionada a menores de 18 anos. Não coletamos intencionalmente dados de menores. Caso identifiquemos dados de menores em nossos sistemas, eles serão eliminados prontamente.`,
  },
  {
    title: '10. Alterações nesta Política',
    body: `Podemos atualizar esta Política de Privacidade periodicamente. Alterações significativas serão notificadas por e-mail ou aviso na plataforma. Recomendamos revisar esta página regularmente.

A data da última atualização será sempre indicada no topo desta página.`,
  },
  {
    title: '11. Contato',
    body: `Para questões relacionadas a esta política ou ao tratamento de seus dados pessoais:

• **E-mail:** leonfpontes@gmail.com
• **WhatsApp:** (16) 99109-1234

Responderemos sua solicitação em até 15 dias úteis, conforme previsto pela LGPD.`,
  },
];

// ═════════════════════════════════════════════════════════════════
export default function PrivacidadePage() {
  return (
    <LegalPageLayout
      pageTitle="Política de Privacidade — Girahub"
      description="Política de Privacidade da plataforma Girahub. Saiba como tratamos seus dados pessoais em conformidade com a LGPD."
      heading="Política de Privacidade"
      updatedAt="Março de 2026"
      intro={
        <>
          A Girahub (&quot;nós&quot;, &quot;nosso&quot;) tem o compromisso de proteger a privacidade e os dados pessoais de
          nossos usuários. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas
          informações ao utilizar nossa plataforma, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº
          13.709/2018).
        </>
      }
      sections={SECTIONS}
    />
  );
}
