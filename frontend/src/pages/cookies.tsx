/**
 * GiraHub — Política de Cookies (v1.0, out/2026). A tabela sai de constants/cookies.ts (a mesma
 * do painel de preferências do banner) e o botão reabre o painel (lib/consent.ts).
 */
import React from 'react';
import { Settings2 } from 'lucide-react';
import { LegalPageLayout, PRIVACY_EMAIL, type LegalHighlight } from '@/components/public/LegalPageLayout';
import { CATEGORIAS_DE_COOKIES } from '@/constants/cookies';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { abrirPreferenciasDeCookies } from '@/lib/consent';
import { useConsentimento } from '@/hooks/useConsentimento';
import { cn } from '@/lib/utils';

const HIGHLIGHTS: LegalHighlight[] = [
  { title: 'Necessários, sempre', text: 'Login, segurança e a sua própria escolha. Sem eles o sistema não funciona.' },
  { title: 'O resto, só se você quiser', text: 'Estatísticas e marketing começam desligados e só ligam se você aceitar.' },
  { title: 'Recusar é tão fácil quanto aceitar', text: 'Os dois botões estão lado a lado no aviso, com o mesmo destaque.' },
  { title: 'Mude quando quiser', text: 'Pelo botão desta página ou por "Preferências de cookies" no rodapé do site.' },
];

const SECTIONS = [
  {
    title: '1. O que são cookies',
    body: `Cookies são pequenos arquivos que um site grava no seu navegador para lembrar de você entre uma página e outra — por exemplo, para manter o login. Tecnologias parecidas, como o armazenamento local do navegador e os pixels de medição, funcionam do mesmo jeito e seguem as mesmas regras nesta política.

Alguns cookies são do próprio GiraHub (primários); outros são gravados por ferramentas de terceiros que usamos, como o Google e a Meta.`,
  },
  {
    title: '2. Como usamos',
    body: `Separamos tudo em três categorias:

• **Necessários:** mantêm você conectado ao painel, protegem a conta, lembram preferências de tela e guardam a sua escolha sobre cookies. Ficam sempre ativos, porque o serviço não funciona sem eles.
• **Estatísticas:** Google Analytics 4 e Microsoft Clarity mostram quais páginas são visitadas e onde as pessoas travam, para melhorarmos o site e o painel. Campos de formulário são mascarados.
• **Marketing:** Google Ads e Meta Pixel medem se os anúncios do GiraHub trazem novos terreiros e permitem mostrar o GiraHub de novo a quem já visitou o site.

Estatísticas e marketing só funcionam com o seu consentimento (LGPD, art. 7º, I). A tabela completa, cookie a cookie, está logo abaixo.`,
  },
  {
    title: '3. Antes da sua escolha',
    body: `Enquanto você não escolhe — ou se recusar — nenhum cookie de estatística ou de marketing é gravado. As tags do Google funcionam no "modo de consentimento": elas não gravam nem leem cookies e enviam apenas sinais sem identificador (como "houve uma visita a esta página"), que o Google usa para estimar resultados de forma agregada. O Meta Pixel e o Microsoft Clarity nem são carregados.

Se você aceitar uma categoria e depois desligá-la, os cookies dela são apagados do seu navegador na hora.`,
  },
  {
    title: '4. Como mudar sua escolha',
    body: `Use o botão **Preferências de cookies** nesta página ou no rodapé do site. A escolha vale por 180 dias neste navegador; depois disso, perguntamos de novo.

Você também pode bloquear ou apagar cookies nas configurações do navegador (Chrome, Safari, Firefox, Edge). Bloquear os necessários impede o login no painel.`,
  },
  {
    title: '5. Sites dos terreiros',
    body: `Os sites das casas hospedados no GiraHub (girahub.com.br/nome-da-casa) seguem esta mesma política e o mesmo aviso. Conforme o que cada casa escolheu exibir, a página pode carregar fontes do Google Fonts, o mapa do OpenStreetMap e vídeos do YouTube no modo de privacidade aprimorada, que não grava cookies até você dar o play.`,
  },
  {
    title: '6. Atualizações e contato',
    body: `Quando entrar uma ferramenta nova, atualizamos esta página e, se ela depender de consentimento, pedimos a sua escolha de novo. Dúvidas: ${PRIVACY_EMAIL}. Mais sobre como tratamos dados pessoais na [Política de Privacidade](/privacidade).`,
  },
];

function SuaEscolha() {
  const { consentimento, pronto } = useConsentimento();
  const estado = (sim: boolean | undefined) =>
    !pronto ? '…' : !consentimento ? 'ainda não escolhido' : sim ? 'ligado' : 'desligado';
  return (
    <section aria-labelledby="sua-escolha-titulo" className="mt-12 rounded-2xl border border-areia-200 bg-areia-50 p-5 sm:p-7">
      <h2 id="sua-escolha-titulo" className="font-display text-2xl font-bold text-tinta">
        Sua escolha neste navegador
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { rotulo: 'Necessários', valor: 'sempre ligado', ok: true },
          { rotulo: 'Estatísticas', valor: estado(consentimento?.estatisticas), ok: Boolean(consentimento?.estatisticas) },
          { rotulo: 'Marketing', valor: estado(consentimento?.marketing), ok: Boolean(consentimento?.marketing) },
        ].map((i) => (
          <div key={i.rotulo} className="rounded-xl bg-white p-4">
            <dt className="text-sm text-tinta-suave">{i.rotulo}</dt>
            <dd className={cn('mt-1 font-semibold', i.ok ? 'text-folha-700' : 'text-tinta')}>{i.valor}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={abrirPreferenciasDeCookies}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-ouro-400 px-5 text-sm font-bold text-cafe-950 outline-none hover:bg-ouro-300 focus-visible:ring-[3px] focus-visible:ring-barro-600/40"
      >
        <Settings2 className="size-4" aria-hidden /> Preferências de cookies
      </button>
    </section>
  );
}

function TabelaDeCookies() {
  return (
    <section aria-labelledby="tabela-cookies-titulo" className="mt-12">
      <h2 id="tabela-cookies-titulo" className="font-display text-2xl font-bold text-tinta">
        Todos os cookies, um a um
      </h2>
      <div className="mt-6 flex flex-col gap-8">
        {CATEGORIAS_DE_COOKIES.map((cat) => (
          <div key={cat.id}>
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-tinta">
              {cat.titulo}
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  cat.obrigatoria ? 'bg-folha-600/10 text-folha-700' : 'bg-ouro-400/20 text-barro-700',
                )}
              >
                {cat.obrigatoria ? 'Sempre ativo' : 'Depende do seu consentimento'}
              </span>
            </h3>
            <p className="mt-1 text-sm text-tinta-suave">{cat.baseLegal}</p>
            {/* Tabela no desktop; no celular cada linha vira um cartão (rótulos via data-label). */}
            <table className="mt-3 w-full border-collapse text-left text-sm">
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-areia-200 text-xs tracking-wider text-tinta-suave uppercase">
                  <th scope="col" className="py-2 pr-4 font-semibold">Nome</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Fornecedor</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Para que serve</th>
                  <th scope="col" className="py-2 font-semibold">Duração</th>
                </tr>
              </thead>
              <tbody className="flex flex-col gap-2 md:table-row-group">
                {cat.itens.map((item) => (
                  <tr
                    key={item.nome}
                    className="flex flex-col gap-1 rounded-xl bg-areia-50 p-3 md:table-row md:rounded-none md:border-b md:border-areia-200 md:bg-transparent md:p-0"
                  >
                    <td className="py-0 pr-4 align-top font-mono text-[0.8rem] font-semibold break-words text-tinta md:py-3">
                      {item.nome}
                    </td>
                    <td className="py-0 pr-4 align-top text-tinta md:py-3">
                      {item.fornecedor}
                      <span className="block text-xs text-tinta-suave">{item.tipo}</span>
                    </td>
                    <td className="py-0 pr-4 align-top text-tinta-suave md:py-3">{item.finalidade}</td>
                    <td className="py-0 align-top text-tinta-suave md:py-3">{item.duracao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CookiesPage() {
  const v = LEGAL_VERSIONS.cookies;
  return (
    <LegalPageLayout
      path="/cookies"
      pageTitle="Política de Cookies — GiraHub"
      description="Quais cookies o GiraHub usa, para quê e por quanto tempo: necessários, estatísticas (Google Analytics, Clarity) e marketing (Google Ads, Meta). Mude sua escolha quando quiser."
      heading="Política de Cookies"
      lead="Quais cookies usamos, o que cada um faz e como você liga ou desliga cada categoria — sem letra miúda."
      updatedAt={v.updatedAt}
      updatedAtIso={v.updatedAtIso}
      version={v.version}
      intro={
        <p>
          Esta política complementa a nossa Política de Privacidade e vale para o site girahub.com.br, o painel dos
          terreiros, a emissão de senhas e os sites das casas hospedados no GiraHub.
        </p>
      }
      highlights={HIGHLIGHTS}
      sections={SECTIONS}
    >
      <SuaEscolha />
      <TabelaDeCookies />
    </LegalPageLayout>
  );
}
