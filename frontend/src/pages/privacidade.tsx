/**
 * GiraHub — Política de Privacidade (v2.0, out/2026). Conferida contra o código: operadores reais
 * (Hostinger, Cloudflare R2, Stripe, Resend, Brevo, Sentry, Google, Microsoft, Meta), dados de cada
 * módulo e retenção que o sistema de fato pratica (sem promessas sem código por trás — R-02).
 */
import React from 'react';
import { LegalPageLayout, PRIVACY_EMAIL, type LegalHighlight } from '@/components/public/LegalPageLayout';
import { LEGAL_VERSIONS, identificacaoDoFornecedor } from '@/constants/legal';

const HIGHLIGHTS: LegalHighlight[] = [
  { title: 'Não vendemos dados', text: 'Nem os seus, nem os dos consulentes, médiuns ou associados da sua casa.' },
  { title: 'Cada casa no seu espaço', text: 'Os dados de um terreiro nunca aparecem para outro. Senhas de acesso são guardadas com criptografia.' },
  { title: 'Cookies só com a sua escolha', text: 'Estatísticas e marketing ficam desligados até você aceitar — e você muda isso quando quiser em [Cookies](/cookies).' },
  { title: 'Seus direitos, sem burocracia', text: `Acesso, correção, cópia ou exclusão: peça em ${PRIVACY_EMAIL} e respondemos em até 15 dias.` },
];

const SECTIONS = [
  {
    title: '1. Quem cuida dos seus dados',
    body: `Esta Política explica como ${identificacaoDoFornecedor()} trata dados pessoais na plataforma, no site girahub.com.br e nos sites dos terreiros hospedados aqui, conforme a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).

Há dois papéis diferentes:

• **GiraHub como controlador:** dados de quem visita o nosso site, cria conta, assina um plano ou fala com o suporte.
• **Terreiro como controlador, GiraHub como operador:** dados que a casa cadastra ou recebe pelo sistema — consulentes, médiuns, associados, inscritos em cursos. Aqui quem decide é o terreiro; nós tratamos esses dados só para prestar o serviço a ele. Para exercer seus direitos sobre esses dados, fale primeiro com a casa — e, se precisar, conosco.`,
  },
  {
    title: '2. Quais dados tratamos',
    body: `**Visitantes do site:** páginas vistas, origem da visita, aparelho, navegador e endereço IP; com o seu consentimento, também cookies de estatísticas e de marketing (veja a [Política de Cookies](/cookies)).

**Quem cria a conta do terreiro:** nome do terreiro, seu nome, e-mail, WhatsApp, CPF ou CNPJ, como conheceu o GiraHub e a principal necessidade da casa. A senha é guardada só em formato criptografado (hash), nunca em texto.

**Usuários do painel:** nome, e-mail, telefone, foto de perfil (opcional), papel e grupo de permissão, sessões abertas (aparelho e navegador) e as ações registradas na trilha de auditoria (com data, hora, endereço IP e navegador).

**Consulentes que pegam senha:** nome e e-mail (obrigatórios), telefone (opcional), categoria de prioridade quando informada (idoso, PcD/TEA, gestante/lactante/criança de colo, mobilidade reduzida), nomes de acompanhantes e o horário escolhido. Não pedimos CPF nem data de nascimento para emitir senha.

**Médiuns e associados (cadastrados pela casa):** nome, contatos, data de nascimento e endereço dos médiuns; mensalidades, pagamentos e comprovantes enviados.

**Inscritos em cursos presenciais:** os dados da ficha definida pela casa, que pode incluir documentos (CPF, RG), endereço, contato de emergência e, nas fichas completas, informações de saúde — sempre com consentimento específico.

**Assinatura:** plano, situação dos pagamentos e identificadores da Stripe. Os dados do cartão ficam só com a Stripe.

**Suporte:** as mensagens trocadas no chat do painel e por e-mail.`,
  },
  {
    title: '3. Para que usamos e com qual base legal',
    body: `• **Prestar o serviço** (emitir senhas, organizar giras, cadastros, site da casa, e-mails de confirmação e avisos): execução de contrato (art. 7º, V) e, para os dados das casas, as instruções do terreiro controlador.
• **Segurança e prevenção a fraudes** (trilha de auditoria, controle de sessões, monitoramento de erros, impedir que o teste grátis seja repetido): legítimo interesse (art. 7º, IX) e proteção do crédito.
• **Guardar registros de acesso** por no mínimo 6 meses: obrigação legal (Marco Civil da Internet, art. 15).
• **Cobrança e obrigações fiscais:** execução de contrato e obrigação legal (art. 7º, II e V).
• **E-mails sobre a conta** (fim do teste, dicas para a primeira gira, novidades do sistema): legítimo interesse, sempre relacionados ao serviço que você usa.
• **Estatísticas de uso do site e do painel** e **medição de anúncios**: consentimento (art. 7º, I), dado no aviso de cookies e revogável a qualquer momento.
• **Dados sensíveis** (saúde em fichas de curso, prioridade de atendimento): consentimento específico ou proteção da vida e da saúde, conforme o caso (art. 11).`,
  },
  {
    title: '4. Dados sensíveis e religião',
    body: `Constar como consulente, médium ou associado de um terreiro pode revelar convicção religiosa, que a LGPD trata como dado sensível. Por isso:

• Os dados de cada casa ficam isolados e só são vistos por quem a casa autorizou.
• Não usamos dados das casas para anúncios, perfis de comportamento ou qualquer finalidade nossa.
• As ferramentas de estatística mascaram campos de formulário — nomes, e-mails, telefones e documentos não chegam a elas.`,
  },
  {
    title: '5. Com quem compartilhamos',
    body: `Não vendemos nem alugamos dados pessoais. Compartilhamos apenas com fornecedores que nos ajudam a operar o GiraHub, sob contrato e só no necessário:

• **Hostinger** — servidor onde o sistema e o banco de dados funcionam.
• **Cloudflare (R2)** — cópias de segurança diárias do banco, criptografadas antes de sair do servidor.
• **Stripe** — pagamento das assinaturas (nome e e-mail do responsável e identificador do terreiro).
• **Resend** e, como reserva, **Brevo** — envio dos e-mails do sistema (confirmação de senha, avisos, recuperação de acesso).
• **Sentry** — registro de erros técnicos, sem dados pessoais (só identificadores internos do usuário e da casa).
• **Google (Analytics e Ads)**, **Microsoft (Clarity)** e **Meta (Pixel)** — estatísticas e medição de anúncios, apenas com o seu consentimento. O Clarity recebe só um identificador interno embaralhado do usuário e o nome do terreiro, nunca e-mail, telefone ou documento.

Nos **sites dos terreiros**, conforme o que a casa escolheu exibir, o seu navegador também acessa: Google Fonts (fontes do site), OpenStreetMap (mapa do endereço), YouTube no modo de privacidade aprimorada (vídeos) e ViaCEP (para completar o endereço pelo CEP em formulários).

Também podemos compartilhar dados quando a lei, uma ordem judicial ou uma autoridade competente exigir, ou para defender direitos em processo.`,
  },
  {
    title: '6. Transferência internacional',
    body: `Alguns fornecedores acima (como Stripe, Resend, Brevo, Sentry, Google, Microsoft, Meta e Cloudflare) processam dados fora do Brasil, principalmente nos Estados Unidos e na União Europeia. Essas transferências seguem o art. 33 da LGPD, com contratos que exigem nível de proteção compatível com a lei brasileira, e envolvem apenas os dados necessários para cada serviço.`,
  },
  {
    title: '7. Cookies',
    body: `Usamos cookies necessários para o login e a segurança, e — só se você aceitar — cookies de estatísticas e de marketing. Sem a sua escolha, nada opcional é gravado. A lista completa, com fornecedor, finalidade e duração de cada cookie, e o botão para mudar a sua escolha estão na [Política de Cookies](/cookies).`,
  },
  {
    title: '8. Como protegemos',
    body: `• Conexão sempre criptografada (HTTPS/TLS).
• Senhas de acesso guardadas com hash bcrypt; sessão em cookie que o JavaScript da página não consegue ler (HttpOnly), com tempo máximo de duração.
• Isolamento por terreiro em todas as consultas ao banco, verificado automaticamente a cada mudança no código.
• Controle de acesso por papéis e grupos de permissão, e trilha de auditoria das ações sensíveis.
• Cópias de segurança diárias criptografadas, com teste de restauração.
• Monitoramento de erros e de disponibilidade.

Nenhum sistema é 100% invulnerável. Se acontecer um incidente de segurança com risco relevante, avisaremos os afetados e a ANPD, como manda a lei.`,
  },
  {
    title: '9. Por quanto tempo guardamos',
    body: `• **Conta e dados da casa:** enquanto a conta estiver ativa. Se o terreiro desativar a conta, os dados ficam guardados para permitir a reativação, até que a casa peça a exclusão definitiva.
• **Exclusão definitiva:** a pedido do terreiro, apagamos os dados do sistema em até 30 dias. Nas cópias de segurança, eles somem conforme as cópias expiram — diárias em até 30 dias e mensais em até 12 meses.
• **Registros de acesso e trilha de auditoria:** no mínimo 6 meses (Marco Civil da Internet) e, depois, enquanto a conta existir, para a segurança da própria casa.
• **Dados de cobrança e notas:** pelo prazo exigido pela legislação fiscal (em geral, 5 anos).
• **Controle do teste grátis:** guardamos o e-mail e uma versão embaralhada (hash) do CPF/CNPJ de quem já usou o teste, para que ele não seja repetido.
• **Dados de consulentes, médiuns e associados:** pelo tempo que o terreiro definir; a casa pode apagá-los no painel ou nos pedir a exclusão.
• **Estatísticas e marketing:** pelo prazo de cada cookie (veja a Política de Cookies) e pelo período de retenção configurado em cada ferramenta.`,
  },
  {
    title: '10. Seus direitos',
    body: `Pela LGPD (art. 18), você pode pedir a qualquer momento:

• Confirmação de que tratamos seus dados e acesso a eles.
• Correção de dados incompletos, errados ou desatualizados.
• Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei.
• Portabilidade para outro fornecedor.
• Informação sobre com quem compartilhamos.
• Revogação do consentimento — para cookies, direto em [Cookies](/cookies); para o resto, pelo e-mail abaixo.
• Revisão de decisões tomadas só por meios automatizados.
• Oposição a tratamentos feitos sem respeitar a lei.

**Como pedir:** envie e-mail para ${PRIVACY_EMAIL}. Podemos pedir uma confirmação de identidade antes de atender. Respondemos em até 15 dias. Usuários do painel também podem corrigir o próprio cadastro e excluir o próprio acesso em Perfil. Se os dados foram cadastrados por um terreiro, encaminharemos o pedido à casa e a ajudaremos a atendê-lo.

Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.`,
  },
  {
    title: '11. Crianças e adolescentes',
    body: `A conta do terreiro só pode ser criada por maiores de 18 anos. Quando uma casa cadastra dados de crianças ou adolescentes (por exemplo, uma criança de colo como prioridade ou acompanhante), ela deve fazê-lo no melhor interesse deles e com a autorização de um dos pais ou responsável (LGPD, art. 14).`,
  },
  {
    title: '12. Encarregado (DPO)',
    body: `O canal do encarregado pelo tratamento de dados pessoais do GiraHub é o e-mail **${PRIVACY_EMAIL}**. Por ele você fala sobre esta Política, faz pedidos de titular e nos avisa de qualquer suspeita de uso indevido de dados.`,
  },
  {
    title: '13. Mudanças nesta Política',
    body: `Esta Política muda quando o GiraHub muda — por exemplo, ao entrar um fornecedor novo. A versão e a data de vigência ficam no topo da página, e mudanças relevantes são avisadas por e-mail ou no painel. Se uma mudança depender do seu consentimento, pediremos de novo.`,
  },
];

export default function PrivacidadePage() {
  const v = LEGAL_VERSIONS.privacidade;
  return (
    <LegalPageLayout
      path="/privacidade"
      pageTitle="Política de Privacidade — GiraHub"
      description="Como o GiraHub trata dados de terreiros, consulentes, médiuns e visitantes conforme a LGPD: o que coletamos, com quem compartilhamos, por quanto tempo e como exercer seus direitos."
      heading="Política de Privacidade"
      lead="O que coletamos, para quê, com quem compartilhamos e como você exerce os seus direitos — incluindo os dados que o seu terreiro guarda aqui."
      updatedAt={v.updatedAt}
      updatedAtIso={v.updatedAtIso}
      version={v.version}
      intro={
        <p>
          Cuidar de uma casa de axé é cuidar de gente — e de informação sobre gente. Esta Política mostra, sem rodeios,
          como o GiraHub trata dados pessoais e o que você pode exigir de nós.
        </p>
      }
      highlights={HIGHLIGHTS}
      sections={SECTIONS}
    />
  );
}
