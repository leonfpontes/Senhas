# Novo construtor do site (beta)

- **Chave:** `beta_novo_construtor_site` · **Grupo:** Para o site · **Situação:** em teste desde 17/11/2026
- **O que faz:** muda a experiência do Meu Site (`/admin/meu-site`) para o jeito dos melhores construtores
  (Wix, Squarespace, Framer, Lovable):
  1. **Começo guiado** (site vazio): 5 perguntas curtas (dados da casa, tradição, o que a casa oferece, rotina,
     redes), com a prévia se formando ao lado, e 3 estilos já com o conteúdo da casa para escolher.
     Nada é inventado: o texto do "Sobre" é montado só com as respostas; nenhuma opção vem marcada.
  2. **Edição direto na prévia:** a prévia fica no centro. Clicar numa seção seleciona e abre os detalhes à
     direita; clicar num título ou texto edita ali mesmo. A seção selecionada tem barra com subir, descer,
     ocultar e excluir; o "+" entre seções insere outra naquela posição. Seções ocultas aparecem esmaecidas.
  3. **Desfazer e refazer** (botões e Ctrl+Z / Ctrl+Shift+Z), além do histórico de versões que já existia.
  4. **Estilo:** troca cores e fontes do site todo de uma vez (Cores da casa, Terra, Mata, Clara, Noite).
     Não mexe em texto, foto nem ordem; capa com foto mantém a foto.
  5. **Seções novas:** Fotos (grade, mosaico, faixa), Linhas de trabalho (cartões, lista), Rotina da casa,
     Perguntas frequentes (sanfona + JSON-LD FAQPage no site público), Redes sociais (botões, ícones) e
     Como ajudar a casa (PIX com botão de copiar e lista do que a casa precisa, sem meta nem urgência).
  6. **Conferência antes de publicar:** lista do que falta (só erro bloqueia), prévia no Google e no WhatsApp.
     Depois de publicar, o cartão de divulgação (link, QR, WhatsApp).
- **Quem enxerga:** só terreiro beta tester que ligou esta beta em Configurações › Laboratório.
- **Ao desligar:** o Meu Site volta ao editor de antes. Nada é apagado: as seções novas continuam no site
  público e no editor antigo aparecem na lista (o painel de cada uma segue funcionando).
- **Onde está:** `frontend/src/components/site/` (`EditableFrame`, `sections/InlineText`, `styles.ts`,
  `editor/GuidedSetup`, `editor/StylePanel`, `editor/PublishCheck`, seções novas em `sections/`) e a migração
  `107_site_secoes_novo_construtor` (valores novos do tipo `site_section_type`).
- **Critério para sair do beta:** casas piloto montam e publicam o site sem ajuda, funciona no celular e no
  iPad com iOS 15, e aprovação do dono.
