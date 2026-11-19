# Textos do site com IA (beta)

- **Chave:** `beta_textos_ia_site` · **Grupo:** Para o site · **Situação:** em teste desde 17/11/2026
- **Quem liga:** a própria casa, em Configurações › Laboratório, como qualquer beta (decisão do dono,
  19/11/2026). Até então a plataforma liberava casa por casa (`tenants.ia_site_liberada`, migração 108); a
  migração 110 tirou a coluna e desligou a beta onde ela estava ligada sem a liberação (não valia), então
  nenhuma casa passou a usar a IA sem ter escolhido. O custo da chave da Anthropic fica contido pelos limites
  por terreiro (abaixo).
- **Depende de:** `beta_novo_construtor_site` ligada (o cartão fica no painel da seção do estúdio) e da variável
  `ANTHROPIC_API_KEY` no servidor. Sem a chave, `GET /api/v1/admin/sites/ia` responde `disponivel: false` e o
  cartão não aparece.
- **O que faz:** no painel da seção, na aba Conteúdo, o cartão **"Escrever com ajuda da IA"** (fechado por padrão)
  deixa escolher:
  - **qual texto:** título, subtítulo, "Sobre", introdução, texto do botão…;
  - **o que fazer:** escrever, melhorar, encurtar ou deixar mais acolhedor. As três últimas só valem com texto
    já escrito;
  - **a ideia, se quiser:** "o que você quer dizer?".
  Vêm até 3 sugestões. Nada entra sozinho: "Usar este texto" aplica como uma edição comum, que dá para desfazer
  (Ctrl+Z). Fechar descarta as sugestões.
- **Regras do conteúdo** (no pedido ao modelo, em `backend/src/services/site_textos_ia.py`):
  - a IA nunca escreve sobre entidades, Orixás, guias, linhas, fundamentos, rituais ou doutrina, e mantém
    as palavras da casa sobre esses temas. A seção **Linhas de trabalho** não tem sugestão e não entra no
    contexto;
  - a IA não inventa fatos (datas, horários, endereço, telefone, nomes, história). Os campos longos ("Sobre",
    texto livre, introduções, "como chegar") só aceitam pedido com texto escrito ou com a ideia da casa;
  - nada de linguagem de venda, urgência, emoji ou frases feitas de texto automático;
  - o texto da casa vai entre marcadores, como dado, e não como instrução.
- **Contexto enviado:** nome da casa e os títulos e textos que ela já escreveu no site (até ~2.500 caracteres),
  sem a seção Linhas. Não vai e-mail, telefone, consulente nem dado de médium.
- **Modelo:** `SITE_IA_MODEL` (padrão `claude-opus-5-5`, esforço baixo), com saída em JSON estruturado e
  `fallbacks: "default"`: se o modelo recusar, a API tenta outro modelo na mesma chamada. Uma recusa final
  devolve a lista vazia.
- **Limites:** 12 pedidos por minuto e 150 por dia **por terreiro** (slowapi, chave `site-ia:<tenant_id>`).
- **Permissões:** `GET /sites/ia` exige `SITE:view` e `POST /sites/ia/sugestoes` exige `SITE:edit`. As duas
  ficam atrás do gate de plano `site_builder` do router de sites. As duas betas precisam estar ligadas, senão
  o servidor responde 403.
- **Configurar:** criar a chave no Console da Anthropic (Chaves de API → "Em outro lugar") e colocar
  `ANTHROPIC_API_KEY=` no `.env`: no local para testar e no `/opt/senhas/.env` em produção. O
  docker-compose passa a variável ao backend. Nunca commitar o valor.
- **Desligar:** apaga só o cartão. Os textos que a casa aplicou continuam no site.
- **Testes:** `backend/tests/unit/test_site_textos_ia.py`, `backend/tests/integration_pg/test_site_textos_ia.py`,
  `backend/tests/integration_pg/test_laboratorio.py` e `frontend/__tests__/components/site/textAssist.test.tsx`.

## Nota da versão (como a casa lê no Laboratório)

Fonte: `BETA_RELEASE_NOTES` em `frontend/src/constants/releaseNotes.ts` (mantenha os dois iguais).

**O que faz.** No estúdio do site, a IA ajuda a escrever títulos e textos. Ela escreve a partir da sua ideia, melhora o que já está escrito, encurta ou deixa mais acolhedor. Vêm até três sugestões, e você escolhe uma ou nenhuma.

**Como usar.**

1. Ligue também o "Novo construtor do site": a ajuda da IA fica dentro dele.
2. No Meu Site, clique na seção que quer mudar. No painel da direita, na aba Conteúdo, abra "Escrever com ajuda da IA".
3. Escolha qual texto (título, subtítulo, Sobre, introdução) e o que fazer. Se quiser, conte em poucas palavras o que deseja dizer.
4. Toque em "Usar este texto" na sugestão que servir. Ela entra como uma edição comum: dá para mexer e desfazer (Ctrl+Z). O público só vê depois que você publicar.

**Quem vê.** Quem pode editar o site da casa. A IA recebe só o nome da casa e o que já está escrito no site. Não vai e-mail, telefone nem dado de consulente ou médium.

**Ao desligar.** O cartão da IA some do estúdio. Os textos que você já aplicou continuam no site.

**Bom saber.**

- A IA não escreve sobre entidades, Orixás, guias, linhas, fundamentos ou rituais. Essas palavras são da casa, e a seção Linhas de trabalho fica de fora.
- Ela não inventa datas, horários, endereço nem história. O que for fato, confira antes de publicar.
- Cada casa pode fazer até 150 pedidos por dia.
