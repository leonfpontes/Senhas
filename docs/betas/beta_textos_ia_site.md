# Textos do site com IA (beta)

- **Chave:** `beta_textos_ia_site` · **Grupo:** Para o site · **Situação:** em teste desde 17/11/2026
- **Quem libera:** **só a plataforma, casa por casa.** A beta usa a chave da Anthropic do GiraHub, então ser
  beta tester não basta. Em /platform › terreiro › cartão "Beta tester (Laboratório)" fica o interruptor
  **"Textos do site com IA"** (`tenants.ia_site_liberada`, migração 108). Sem ele, a beta nem aparece no
  Laboratório da casa, o PUT do Laboratório responde 403 e a beta não vale, mesmo que já estivesse ligada.
  Depois da liberação, a casa liga ou desliga a beta em Configurações › Laboratório.
  (`Beta.liberacao` em `services/laboratorio.py`.)
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
