/**
 * Girahub — Termos de Uso
 */
import React from 'react';
import { LegalPageLayout } from '@/components/public/LegalPageLayout';

// ─── Terms sections ──────────────────────────────────────────────
const SECTIONS = [
  {
    title: '1. Descrição do Serviço',
    body: `O Girahub é uma plataforma SaaS (Software as a Service) multi-tenant para gestão de senhas e giras em terreiros de Umbanda e organizações religiosas afins. O serviço inclui:

• Emissão e gestão de senhas online para consulentes.
• Criação e administração de giras com controle de vagas e portas de atendimento.
• Painel administrativo com analytics, relatórios e trilha de auditoria.
• Envio de notificações por e-mail (confirmações de senha, alertas administrativos).
• Isolamento completo de dados entre diferentes terreiros (multi-tenant).`,
  },
  {
    title: '2. Cadastro e Conta',
    body: `Para utilizar o Girahub como administrador, é necessário:

• Criar uma conta fornecendo informações verdadeiras e atualizadas.
• Manter a confidencialidade de suas credenciais de acesso (e-mail e senha).
• Ser responsável por todas as atividades realizadas em sua conta.
• Notificar imediatamente o Girahub em caso de uso não autorizado da conta.

O Girahub reserva-se o direito de recusar ou cancelar cadastros que contenham informações falsas ou que violem estes Termos.`,
  },
  {
    title: '3. Responsabilidades do Usuário',
    body: `Ao utilizar a plataforma, o usuário se compromete a:

• Utilizar o serviço apenas para fins legítimos e de acordo com a legislação brasileira vigente.
• Não tentar acessar dados de outros terreiros ou contornar os mecanismos de segurança da plataforma.
• Não utilizar a plataforma para distribuir conteúdo ilegal, difamatório, discriminatório ou que viole direitos de terceiros.
• Manter os dados de consulentes sob sua gestão em conformidade com a LGPD.
• Não realizar engenharia reversa, descompilar ou interferir no funcionamento da plataforma.`,
  },
  {
    title: '4. Propriedade Intelectual',
    body: `Todo o conteúdo da plataforma Girahub — incluindo, mas não limitado a, código-fonte, design, marca, logotipos, textos, ícones e documentação — é de propriedade exclusiva do Girahub e protegido pela legislação brasileira de propriedade intelectual.

O usuário não adquire qualquer direito de propriedade sobre a plataforma ao utilizá-la. É proibida a reprodução, distribuição ou modificação de qualquer parte da plataforma sem autorização expressa por escrito.`,
  },
  {
    title: '5. Disponibilidade do Serviço',
    body: `O Girahub emprega seus melhores esforços para manter a plataforma disponível 24 horas por dia, 7 dias por semana. No entanto, o serviço pode sofrer interrupções temporárias para:

• Manutenção programada (com aviso prévio quando possível).
• Atualizações de segurança e correções de vulnerabilidades.
• Eventos de força maior ou circunstâncias fora de nosso controle.

O Girahub não garante disponibilidade ininterrupta e não será responsável por danos decorrentes de indisponibilidade temporária.`,
  },
  {
    title: '6. Limitação de Responsabilidade',
    body: `Dentro dos limites permitidos pela lei brasileira:

• O Girahub não será responsável por danos indiretos, incidentais, especiais ou consequenciais decorrentes do uso ou impossibilidade de uso da plataforma.
• A responsabilidade total do Girahub, em qualquer circunstância, estará limitada ao valor pago pelo usuário nos 12 meses anteriores ao evento que deu origem à reclamação.
• O Girahub não se responsabiliza por decisões tomadas com base em relatórios ou dados gerados pela plataforma.`,
  },
  {
    title: '7. Suspensão e Encerramento',
    body: `O Girahub poderá suspender ou encerrar o acesso do usuário à plataforma nas seguintes situações:

• Violação destes Termos de Uso ou da Política de Privacidade.
• Uso da plataforma para atividades ilegais ou fraudulentas.
• Tentativa de comprometer a segurança ou integridade do serviço.
• Inatividade prolongada da conta (após notificação prévia).

Em caso de encerramento, o usuário terá 30 dias para solicitar a exportação de seus dados, após os quais os dados serão eliminados conforme nossa Política de Privacidade.`,
  },
  {
    title: '8. Modificações nos Termos',
    body: `O Girahub reserva-se o direito de modificar estes Termos de Uso a qualquer momento. Alterações significativas serão notificadas por:

• E-mail para o endereço cadastrado na conta do administrador.
• Aviso em destaque no painel administrativo.

O uso continuado da plataforma após a notificação de alterações constitui aceitação dos novos termos. Caso o usuário não concorde com as alterações, deverá cessar o uso da plataforma e solicitar o encerramento de sua conta.`,
  },
  {
    title: '9. Proteção de Dados e LGPD',
    body: `O tratamento de dados pessoais no Girahub segue rigorosamente a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Para informações detalhadas sobre coleta, armazenamento, uso e proteção de dados pessoais, consulte nossa Política de Privacidade em /privacidade.

O Girahub atua como operador de dados em relação aos dados de consulentes inseridos pelos administradores dos terreiros. Os administradores, na qualidade de controladores, são responsáveis por garantir base legal adequada para o tratamento dos dados de seus consulentes.`,
  },
  {
    title: '10. Isenção de Garantias Específicas',
    body: `A plataforma Girahub é fornecida "no estado em que se encontra" (as is). Não oferecemos garantias específicas quanto a:

• Adequação da plataforma a fins específicos não previstos em sua descrição.
• Resultados específicos decorrentes do uso da plataforma.
• Ausência total de erros, bugs ou vulnerabilidades de segurança.

Trabalhamos continuamente para melhorar o serviço, mas não podemos garantir perfeição absoluta em um sistema de software.`,
  },
  {
    title: '11. Lei Aplicável e Foro',
    body: `Estes Termos de Uso são regidos pela legislação da República Federativa do Brasil.

Fica eleito o foro da Comarca de Ribeirão Preto, Estado de São Paulo, como competente para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`,
  },
  {
    title: '12. Disposições Gerais',
    body: `• Se qualquer disposição destes Termos for considerada inválida ou inexequível, as demais disposições permanecerão em pleno vigor e efeito.
• A tolerância do Girahub quanto ao descumprimento de qualquer obrigação não constituirá renúncia ao direito de exigir o cumprimento da obrigação a qualquer tempo.
• Estes Termos constituem o acordo integral entre o usuário e o Girahub em relação ao uso da plataforma, substituindo todos os acordos anteriores sobre o mesmo assunto.`,
  },
  {
    title: '13. Contato',
    body: `Para questões relacionadas a estes Termos de Uso:

• **E-mail:** leonfpontes@gmail.com
• **WhatsApp:** (16) 99109-1234

Estamos à disposição para esclarecer dúvidas e receber sugestões para melhoria de nossos termos e serviços.`,
  },
];

// ═════════════════════════════════════════════════════════════════
export default function TermosPage() {
  return (
    <LegalPageLayout
      pageTitle="Termos de Uso — Girahub"
      description="Termos de Uso da plataforma Girahub. Leia atentamente as condições para utilização do serviço."
      heading="Termos de Uso"
      updatedAt="Março de 2026"
      intro={
        <>
          Bem-vindo ao Girahub. Ao acessar ou utilizar nossa plataforma, você concorda com estes Termos de Uso.
          Leia-os atentamente. Se você não concordar com qualquer parte destes termos, não utilize o serviço.
        </>
      }
      sections={SECTIONS}
    />
  );
}
