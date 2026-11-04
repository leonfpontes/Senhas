/**
 * GiraHub — Termos de Uso (v2.0, out/2026). Texto conferido contra o código: planos e preços vêm
 * de constants/plans.ts, cobrança do Stripe (services/stripe_service.py), teste de 30 dias
 * (onboarding.py), desativação/reativação (auth/deactivation.py). Mudou o produto → revise aqui.
 */
import React from 'react';
import { LegalPageLayout, PRIVACY_EMAIL, type LegalHighlight } from '@/components/public/LegalPageLayout';
import { PLAN_LIST } from '@/constants/plans';
import { LEGAL_VERSIONS, identificacaoDoFornecedor } from '@/constants/legal';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
const PRECOS = PLAN_LIST.map((p) => `• **${p.label}:** ${p.price === 0 ? 'grátis, sem prazo para acabar' : `${brl(p.price)} por mês`}`).join('\n');

const HIGHLIGHTS: LegalHighlight[] = [
  { title: 'Comece sem pagar', text: 'O plano Gratuito não acaba, e todo terreiro novo testa o Premium por 30 dias sem cartão.' },
  { title: 'Sem fidelidade', text: 'Mude de plano ou cancele pelo painel quando quiser. O cancelamento vale no fim do mês já pago.' },
  { title: 'Os dados são da casa', text: 'O terreiro decide sobre os dados de consulentes, médiuns e associados; o GiraHub só os guarda e processa por ele.' },
  { title: 'Use com respeito', text: 'Nada de usar o sistema para fraude, discriminação, spam ou para tentar ver dados de outra casa.' },
];

const SECTIONS = [
  {
    title: '1. Quem somos e o que é o GiraHub',
    body: `Estes Termos regem o uso da plataforma ${identificacaoDoFornecedor()} ("GiraHub", "nós"), disponível em [girahub.com.br](/).

O GiraHub é um sistema on-line para terreiros de Umbanda, Candomblé e demais casas de axé organizarem a vida da casa. Conforme o plano contratado, ele inclui:

• Emissão de senhas pela internet (pelo link enviado no WhatsApp ou no site da casa) e chamada dos consulentes pela Porta, inclusive em TV.
• Agenda de giras com vagas, prioridades, fila de espera e horário marcado.
• Cadastro de médiuns e da corrente, associados, mensalidades, estoque e financeiro da casa.
• Cursos presenciais com inscrição pela internet.
• Site do terreiro, com endereço próprio em girahub.com.br.
• Relatórios, trilha de auditoria e controle de acesso por grupos de permissão.

Cada terreiro tem um espaço isolado: os dados de uma casa nunca aparecem para outra.`,
  },
  {
    title: '2. Aceite e quem pode usar',
    body: `Ao criar uma conta ou usar o painel, você declara ter lido e aceito estes Termos e a [Política de Privacidade](/privacidade). Se não concordar, não use o serviço.

A conta do terreiro deve ser criada por uma pessoa maior de 18 anos com autorização para representar a casa. Quem cria a conta passa a ser o administrador e responde pelo uso que a casa fizer da plataforma.

Consulentes que pegam senha, inscritos em cursos e visitantes do site do terreiro não precisam de conta: para eles valem a Política de Privacidade e as regras da própria casa.`,
  },
  {
    title: '3. Conta, usuários e segurança',
    body: `• Informe dados verdadeiros no cadastro e mantenha-os atualizados.
• Cada pessoa da casa deve ter o próprio usuário. Não compartilhe senhas.
• O administrador cria usuários e define, pelos grupos de permissão, o que cada um pode ver, criar, editar ou excluir. O número de usuários é ilimitado em todos os planos.
• Toda ação importante fica registrada na trilha de auditoria, com data, hora e usuário.
• Use "Manter conectado" só em aparelhos pessoais. Ao suspeitar de acesso indevido, troque a senha e nos avise em ${PRIVACY_EMAIL}.

Você é responsável pelo que for feito com os usuários da sua casa.`,
  },
  {
    title: '4. Planos, teste grátis e pagamento',
    body: `Os planos e preços vigentes estão em [Planos e preços](/planos):

${PRECOS}

• **Teste grátis:** todo terreiro novo usa o Premium por 30 dias, sem cartão de crédito, uma única vez por CPF/CNPJ ou e-mail. Avisamos por e-mail antes do fim. Se você não assinar, a casa volta ao plano Gratuito sem perder nada do que cadastrou; só os recursos dos planos pagos ficam bloqueados.
• **Cobrança:** os planos pagos são mensais e renovam automaticamente. O pagamento é processado pela Stripe, com os meios de pagamento mostrados na tela de assinatura; o GiraHub não vê nem guarda o número do seu cartão.
• **Troca de plano:** vale na hora. Na troca, a diferença do mês em curso é calculada proporcionalmente e cobrada (ou descontada) na fatura.
• **Cancelamento:** pelo painel, a qualquer momento, sem multa. O plano continua até o fim do período já pago e depois a casa volta ao Gratuito. Dá para desfazer o cancelamento antes disso.
• **Sem reembolso:** valores já pagos não são devolvidos, nem em parte, inclusive quando o plano é cancelado no meio do período. É por isso que o Premium pode ser testado por 30 dias de graça e sem cartão: dá para conhecer tudo antes de pagar. Ficam ressalvados apenas os direitos que a lei garante de forma obrigatória, como o direito de arrependimento do Código de Defesa do Consumidor (art. 49), quando aplicável.
• **Pagamento recusado:** a assinatura fica suspensa e o painel deixa de criar giras e médiuns novos até a regularização; o que já existe continua acessível. Sem regularização, a casa volta ao Gratuito.
• **Reajustes:** mudanças de preço são avisadas com pelo menos 30 dias de antecedência e só valem a partir da renovação seguinte.`,
  },
  {
    title: '5. Uso aceitável',
    body: `Ao usar o GiraHub, você se compromete a não:

• Usar o sistema para atividades ilegais, fraude ou cobrança indevida.
• Publicar no site do terreiro conteúdo ofensivo, discriminatório, que incite intolerância religiosa ou que viole direitos de terceiros (inclusive imagem e direitos autorais).
• Enviar mensagens em massa não solicitadas (spam) usando os links ou contatos do sistema.
• Tentar acessar dados de outras casas, burlar limites de plano ou os mecanismos de segurança.
• Copiar, revender, fazer engenharia reversa ou sobrecarregar a plataforma de propósito (robôs, ataques).

Se percebermos um desses usos, podemos remover o conteúdo, limitar ou suspender a conta, como descrito na seção de suspensão.`,
  },
  {
    title: '6. Dados dos consulentes, médiuns e associados',
    body: `Para a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), **o terreiro é o controlador** dos dados que cadastra ou recebe pelo GiraHub (consulentes, médiuns, associados, inscritos em cursos), e **o GiraHub é o operador**: guardamos e processamos esses dados apenas para prestar o serviço à casa, seguindo as instruções dela e a [Política de Privacidade](/privacidade).

Cabe ao terreiro:

• Ter uma base legal para cada dado que cadastra e informar as pessoas sobre o uso — o aviso da emissão de senha já aponta para a nossa Política de Privacidade.
• Lembrar que a ligação com uma casa religiosa pode revelar convicção religiosa, que é dado pessoal sensível (LGPD, art. 5º, II). Dados de saúde pedidos em fichas de curso também são sensíveis e exigem consentimento específico.
• Pedir só o necessário e atender os pedidos dos titulares (acesso, correção, exclusão). Ajudamos no que depender do sistema.
• Cadastrar dados de crianças e adolescentes só com a autorização de um dos pais ou responsável.

Não usamos os dados das casas para fins próprios de marketing e não os vendemos.`,
  },
  {
    title: '7. Site do terreiro e conteúdo publicado',
    body: `O terreiro é o responsável por tudo o que publica no próprio site e nas páginas públicas (textos, fotos, vídeos, endereço, links de redes sociais). Ao publicar, a casa nos autoriza a hospedar e exibir esse conteúdo enquanto o site estiver no ar, só para prestar o serviço.

Publique apenas fotos e vídeos que a casa tenha direito de usar e com a autorização das pessoas que aparecem. Removemos conteúdo quando houver ordem judicial ou violação clara destes Termos.

O endereço do site (girahub.com.br/nome-da-casa) é escolhido no cadastro; alguns nomes são reservados para páginas do próprio GiraHub.`,
  },
  {
    title: '8. Propriedade intelectual',
    body: `O GiraHub — código, telas, marca, logotipo, textos e documentação — pertence a nós e é protegido pela legislação de propriedade intelectual. O plano dá à casa uma licença de uso, pessoal e intransferível, enquanto a conta estiver ativa.

Os dados e o conteúdo que o terreiro cadastra continuam sendo do terreiro.`,
  },
  {
    title: '9. Disponibilidade, suporte e mudanças no serviço',
    body: `Trabalhamos para manter o GiraHub no ar o tempo todo, com monitoramento de erros e cópias de segurança diárias criptografadas. Ainda assim, podem acontecer interrupções para manutenção, atualizações de segurança ou por motivos fora do nosso controle (queda de provedores, energia, internet). Manutenções planejadas são feitas, sempre que possível, fora dos horários de gira. O estado do sistema fica em [Status do sistema](/status).

O suporte é feito pelo chat do painel ("Falar com o suporte"), por e-mail e pelo WhatsApp comercial.

O GiraHub evolui com frequência. Podemos criar, mudar ou retirar funcionalidades; quando uma mudança tirar algo importante de um plano pago, avisamos antes e, se você não concordar, pode cancelar sem custo.`,
  },
  {
    title: '10. Responsabilidades e limites',
    body: `Respondemos pelos danos que causarmos ao prestar o serviço, nos termos da lei. Dentro do que a lei permite:

• Não respondemos por decisões da casa tomadas a partir de relatórios do sistema, nem por conteúdo publicado pelo terreiro ou por terceiros.
• Não respondemos por falhas causadas por uso em desacordo com estes Termos, pela internet ou aparelho do usuário, ou por acesso indevido com senha que o próprio usuário compartilhou.
• Quando a casa contrata como empresa ou entidade (fora de uma relação de consumo), nossa responsabilidade total fica limitada ao valor pago nos 12 meses anteriores ao fato.

Nada nestes Termos afasta direitos garantidos pelo Código de Defesa do Consumidor a quem é consumidor.`,
  },
  {
    title: '11. Suspensão, encerramento e seus dados',
    body: `**Pela casa:** o administrador pode desativar a conta do terreiro em Perfil. A assinatura é cancelada na hora, os acessos são encerrados e enviamos por e-mail um link para reativar — os dados ficam guardados para a reativação até que a casa peça a exclusão definitiva em ${PRIVACY_EMAIL}. Cada usuário também pode excluir o próprio acesso pelo Perfil.

**Por nós:** podemos suspender ou encerrar contas que violem estes Termos ou a lei, que ponham em risco a segurança da plataforma ou de outras casas, ou em caso de fraude no pagamento. Sempre que possível, avisamos antes e damos prazo para corrigir.

**Seus dados ao sair:** antes da exclusão definitiva, a casa pode pedir uma cópia dos seus dados pelo mesmo e-mail. Após a exclusão, os dados saem do sistema em até 30 dias e das cópias de segurança à medida que elas expiram (até 12 meses), salvo o que a lei obriga a guardar. Os detalhes estão na [Política de Privacidade](/privacidade).`,
  },
  {
    title: '12. Alterações destes Termos',
    body: `Podemos atualizar estes Termos para acompanhar o produto e a lei. A versão e a data de vigência ficam no topo desta página. Mudanças relevantes são avisadas ao administrador por e-mail ou no painel com pelo menos 15 dias de antecedência; continuar usando o GiraHub depois disso significa aceitar a nova versão. Se não concordar, você pode cancelar sem multa.`,
  },
  {
    title: '13. Lei aplicável e foro',
    body: `Estes Termos seguem as leis brasileiras. Fica eleito o foro da Comarca de Ribeirão Preto/SP para resolver qualquer conflito, ressalvado o direito do consumidor de propor a ação no foro do próprio domicílio.

Se uma cláusula for considerada inválida, as demais continuam valendo. Deixar de exigir um direito em algum momento não significa abrir mão dele.`,
  },
  {
    title: '14. Contato',
    body: `Dúvidas sobre estes Termos, a sua assinatura ou os seus dados:

• **E-mail:** ${PRIVACY_EMAIL}
• **Chat do painel:** menu do perfil → "Falar com o suporte"`,
  },
];

export default function TermosPage() {
  const v = LEGAL_VERSIONS.termos;
  return (
    <LegalPageLayout
      path="/termos"
      pageTitle="Termos de Uso — GiraHub"
      description="Termos de Uso do GiraHub: planos e teste grátis, pagamento e cancelamento, responsabilidades do terreiro e do GiraHub e o tratamento dos dados da casa."
      heading="Termos de Uso"
      lead="As regras do combinado entre o seu terreiro e o GiraHub, em linguagem direta: o que oferecemos, como funcionam planos e pagamento e o que cabe a cada lado."
      updatedAt={v.updatedAt}
      updatedAtIso={v.updatedAtIso}
      version={v.version}
      intro={
        <p>
          Bem-vindo ao GiraHub. Estes Termos valem para todo uso da plataforma — do painel do terreiro ao site da casa.
          Leia com calma; se algo não ficar claro, fale com a gente antes de aceitar.
        </p>
      }
      highlights={HIGHLIGHTS}
      sections={SECTIONS}
    />
  );
}
