# Novo construtor do site (beta)

- **Chave:** `beta_novo_construtor_site` · **Grupo:** Para o site · **Situação:** em teste desde 17/11/2026
- **O que faz:** troca o Meu Site (`/admin/meu-site`) por um **estúdio em tela cheia**, no padrão dos melhores
  construtores (Wix, Squarespace, Framer, Lovable). Redesenho de 17/11/2026, depois do primeiro teste do dono.
  1. **Começo** (site vazio), com três caminhos: responder algumas perguntas (o começo guiado: dados da casa,
     tradição, o que a casa oferece, rotina, redes e estilo), **partir de um modelo** (Casa completa, Essencial,
     Acolhida, Fotos e redes, cada um com prévia em computador, tablet e celular antes de usar) ou começar do zero
     (só a capa). Modelos e perguntas só usam o que a casa cadastrou ou respondeu; nada sobre entidades, Orixás ou
     fundamentos é escrito pelo sistema, e nenhuma opção vem marcada.
  2. **Estúdio:** barra superior (voltar ao painel, nome e situação do site, salvamento, computador/tablet/celular,
     desfazer/refazer, Visualizar, Publicar e menu com abrir, divulgar, atalhos e tirar do ar); barra de ferramentas
     à esquerda com os painéis **Seções** (lista com arrastar para reordenar, ocultar, duplicar, excluir),
     **Adicionar** (seções agrupadas, com busca; entra depois da seção escolhida), **Estilo** (estilos prontos,
     cor principal e fontes de títulos e texto para o site todo), **Passos** (lista "o que falta" com progresso,
     como a do Wix), **Ajustes** (endereço e como aparece no Google) e **Histórico** (versões); no centro, o site
     de verdade, editável com um clique, com "+ Adicionar seção" nas bordas da seção ao passar o mouse; à direita,
     o painel da seção escolhida com subir, descer, duplicar, ocultar e excluir.
  3. **Desfazer e refazer** e atalhos de teclado (Ctrl+Z, Ctrl+Shift+Z, Ctrl+D duplica, Alt+↑/↓ move, Delete
     exclui, Esc fecha, P visualiza).
  4. **Seções novas:** Fotos (grade, mosaico, faixa), Linhas de trabalho (cartões, lista), Rotina da casa,
     Perguntas frequentes (sanfona + JSON-LD FAQPage no site público), Redes sociais (botões, ícones) e
     Como ajudar a casa (PIX com botão de copiar e lista do que a casa precisa, sem meta nem urgência).
  5. **Conferência antes de publicar:** lista do que falta (só erro bloqueia), prévia no Google e no WhatsApp.
     Depois de publicar, o cartão de divulgação (link, QR, WhatsApp).
  6. **Sair sem perder nada:** "Painel" salva o rascunho antes de sair; site no ar com mudanças não publicadas
     pergunta antes de descartar.
  7. **Celular:** o site ocupa a tela, as ferramentas ficam numa barra embaixo e os painéis abrem como gaveta.
  8. **Gaveta "Adicionar":** blocos prontos já num jeito de mostrar (Fotos em grade, mosaico ou faixa; Contato
     em cartões, botões ou lista; Redes em botões ou ícones; Linhas em cartões ou lista; Vídeo sozinho ou com
     texto), com miniatura na cor do site, categorias, busca sem acento e "Falta no seu site". Clicar coloca na
     posição indicada; arrastar para a prévia mostra uma linha de encaixe entre as seções e solta ali (no
     computador; no celular é só o clique). X, Esc ou o ícone de novo fecham sem adicionar.
  9. **O que aparece em cada seção:** no painel da seção, "O que aparece nesta seção" tem um interruptor por
     elemento (título, texto, foto, botões, mapa, cada canal de contato, cada rede, PIX, botão de copiar…).
     Cada um é uma chave `show_<elemento>` na config da seção, **padrão ligado** (chave ausente = aparece, só
     `false` esconde), então os sites existentes não mudam e não há backend novo. O site público e a prévia
     respeitam a mesma chave (`components/site/elements.ts`, `shows()`). Os campos de um elemento desligado
     somem do painel. Abaixo, as abas **Conteúdo** (textos, fotos, itens) e **Estilo** (cores, fontes,
     fundo, espaço, layout; o antigo "Avançado").
     Casos especiais: o nome da casa escondido na capa continua num `h1` só para leitor de tela e Google; o
     logo junta o "Com logo" antigo (`logo_mode`) e `show_logo`; o botão da capa tem texto editável
     (`cta_label`), usado também na barra fixa "Retirar senha" do celular, que se liga e desliga na capa
     (`show_mobile_cta`) ou em Ajustes › No celular.
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** o Meu Site volta ao editor de antes. Nada é apagado: as seções novas continuam no site
  público e no editor antigo aparecem na lista (o painel de cada uma segue funcionando).
- **Onde está:** `frontend/src/components/site/editor/studio/` (`SiteStudio`, `StudioStart`, `StudioCanvas`,
  `Inspector`, `panels`, `templates`, `blocks`, `BlockThumb`), `components/site/elements.ts`, mais `EditableFrame`, `sections/InlineText`, `styles.ts`,
  `editor/GuidedSetup`, `editor/StylePanel`, `editor/PublishCheck` e as seções novas em `sections/`; a migração
  `107_site_secoes_novo_construtor` (valores novos do tipo `site_section_type`).
- **Critério para sair do beta:** casas piloto montam e publicam o site sem ajuda, funciona no celular e no
  iPad com iOS 15, e aprovação do dono.
