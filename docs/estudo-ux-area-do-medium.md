# Estudo de experiência e usabilidade da Área do Médium (AM-00)

Criado: 2026-10-07 · Status: **preparado, não iniciado** · Card: **AM-00** · Plano técnico:
[plano-area-do-medium.md](plano-area-do-medium.md)

O dono pediu um estudo completo de experiência **antes** de desenvolver a Área do Médium, com foco em
usabilidade, facilidade, termos conhecidos, jornada simples e uso no celular. Este documento é o roteiro desse
estudo: o que queremos descobrir, com quem, como, quais telas testar, o que conta como sucesso e o que sai no fim.

Quem faz o quê:
- **Dono**: recruta os participantes nas casas e conduz as conversas e os testes, por chamada de vídeo no
  WhatsApp ou presencialmente. É a pessoa em quem as casas confiam.
- **Claude**: prepara roteiros, protótipo e formulários, organiza as anotações e escreve a síntese, o
  glossário e as mudanças nos cards.

---

## 1. Por que estudar antes

A Área do Médium é a primeira parte do GiraHub feita para **quem não escolheu o sistema**. O dirigente assinou;
o médium vai receber um link e decidir em segundos se vale a pena. Os riscos são de experiência, não de código:

- **Adoção** (risco R-09 do plano): se o convite e o primeiro acesso forem difíceis, o médium não ativa e a casa
  volta para o grupo do WhatsApp.
- **Vocabulário**: cada casa fala de um jeito (médium, filho da casa, filho de santo; mensalidade ou
  contribuição; gira, sessão ou toque). Um termo errado soa frio, comercial ou de "outra religião".
- **Celular simples**: boa parte da corrente usa Android de entrada, internet móvel e letra grande, e abre links
  **de dentro do WhatsApp**. Esse navegador embutido do WhatsApp tem comportamentos próprios: sessão, download de
  `.ics` e envio de foto da galeria.
- **Público diverso**: idades de 16 a 80 anos e níveis de familiaridade com aplicativo muito diferentes.
- **Dado sensível**: religião é dado sensível na LGPD (art. 11). Avisos na tela bloqueada, e-mails e a própria
  existência da conta precisam ser discretos.

Mudar uma tela no protótipo custa minutos; mudar depois de pronta custa dias e reabre testes de backend.

---

## 2. Perguntas que o estudo precisa responder

**Entrada**
1. O médium entende que o convite veio da casa e é seguro? Ele consegue criar a senha sozinho?
2. Como ele espera voltar depois: link salvo, ícone na tela inicial, `girahub.com.br` ou "o link que a casa
   mandou"?
3. Quem é operador e médium entende a escolha "Área do Médium" ou "Painel do terreiro"?

**Vocabulário**
4. Qual nome da área faz sentido para **toda a corrente**, inclusive ogãs, ekedis e cambones, que nem sempre são
   médiuns de incorporação?
5. Qual termo usar para cada conceito do glossário (§6)?

**Rotina**
6. Hoje, como o médium fica sabendo da próxima gira, do que levar, dos avisos, da faxina e de quanto e como pagar?
   Onde isso falha?
7. O que ele quer ver primeiro ao abrir? A ordem do Início (próxima gira, avisos, mensalidade, escala) está certa?

**Mensalidade**
8. Ele consegue pagar com o PIX copia e cola e mandar o comprovante sem ajuda?
9. Mandar comprovante pelo app em vez de no grupo faz sentido, ou soa como desconfiança da casa?
10. O passo a passo do "Pix Agendado" no banco ajuda ou confunde?

**Presença e escala**
11. "Vou / Não vou" com justificativa é natural, ou parece cobrança? Que palavras evitam esse tom?
12. Como as casas organizam hoje a faxina e a escala de gira? O planejador por grupos e dias (§8.7 do plano) bate
    com isso?

**Lado do dirigente**
13. O dirigente consegue convidar, publicar um aviso e conferir um comprovante no celular, entre uma gira e outra?
14. Quanto o dirigente aceita controlar (quem leu, quem pagou, quem veio) sem parecer vigilância sobre a corrente?

---

## 3. Princípios de experiência (valem para toda tela da Área)

Estes princípios entram como critério de aceite de UX em todos os cards com tela (§10).

| # | Princípio | Como se verifica |
|---|---|---|
| P1 | **Celular primeiro, uma coluna.** Base de 360 × 640 px; nada de rolagem lateral. | Teste em 360 px e num Android de entrada real |
| P2 | **Tudo ao alcance do polegar.** Ação principal embaixo; alvos de toque ≥ 48 px; no máximo 5 itens na barra inferior. | Revisão do protótipo e da tela pronta |
| P3 | **Uma tarefa, uma tela, um botão principal.** Nenhuma tela com duas ações concorrendo pelo destaque. | Revisão |
| P4 | **No máximo 3 toques do Início** até as tarefas centrais: ver a próxima gira, ler um aviso, pagar e responder à escala. | Contagem no protótipo |
| P5 | **Palavras da casa, não do sistema.** Sem "login", "dashboard", "status", "módulo", "check-in" e "upload". Termos do glossário (§6). | Teste de vocabulário + revisão de textos |
| P6 | **Letra grande não quebra.** A tela funciona com a fonte do Android em 130% e o zoom do navegador em 200%. | Teste com a fonte aumentada |
| P7 | **Abre bem de dentro do WhatsApp.** Convite, login, PIX, comprovante e "adicionar à agenda" funcionam no navegador embutido do WhatsApp no Android e no iPhone. | Teste em aparelho real |
| P8 | **Erro diz o que fazer.** Toda mensagem de erro tem a próxima ação ("Peça um novo convite à casa"). | Revisão |
| P9 | **Nada exposto.** O médium só vê o que é dele. Notificações e e-mails não citam religião, entidade nem valor. | Revisão + testes do plano (R-02, R-06) |
| P10 | **Internet fraca.** Carrega em 3G, mostra esqueleto enquanto carrega e não perde o que foi digitado se a conexão cair. | Teste com rede limitada no DevTools |
| P11 | **Contraste AA e claro/escuro.** Marca do terreiro com `text-brand` e `text-X-strong` (testes de contraste). | Testes automáticos já existentes |
| P12 | **Ícone sempre com texto.** Nenhum botão só com ícone na Área do Médium. | Revisão |

---

## 4. Participantes

**Casas**: 3 a 4 terreiros que já usam o GiraHub, de preferência as casas dos depoimentos da landing e uma casa
que use mensalidade. Incluir pelo menos uma casa de candomblé ou de nação, se houver, para testar o vocabulário.

**Perfis** (meta: 8 a 10 médiuns + 3 a 4 dirigentes no total):

| Perfil | Quantos | Por quê |
|---|---|---|
| Médium com mais de 55 anos, pouco à vontade com aplicativo | 2–3 | Teste de facilidade de verdade |
| Médium jovem e muito à vontade com o celular | 2 | Expectativa de app moderno |
| Cambone, ogã ou ekedi | 2 | Testa se "médium" serve como nome da área |
| Médium iniciante (menos de 1 ano na casa) | 1–2 | Não conhece os costumes, depende de aviso |
| Operador que também é médium | 1 | Escolha de área |
| Dirigente ou tesoureiro | 3–4 | Convite, avisos, comprovante, escala e chamada |

Pelo menos metade usando **Android**, com o celular de uso diário (sem aparelho emprestado).

**Ética e LGPD**
- Participação voluntária. Consentimento falado no início, gravado só se a pessoa aceitar.
- Anotações sem nome: P1, P2, D1 etc. Não registrar entidade, orixá, cargo espiritual nem nada além do perfil
  da tabela.
- Protótipo só com dados fictícios. Não pedir para a pessoa abrir o banco de verdade: no teste de PIX, ela
  descreve o que faria.
- Agradecimento à casa participante: sugestão de **1 mês grátis** no plano atual. A decisão é do dono.

---

## 5. Método e cronograma (3 semanas)

### Semana 1 — Descoberta e vocabulário
1. **Conversas com médiuns** (20–30 min cada, 6–8 pessoas): rotina atual com o grupo do WhatsApp, como pagam,
   como sabem da faxina, que app usam todo dia, como abrem links. Roteiro no §8.1.
2. **Conversas com dirigentes** (30 min, 3–4 pessoas): o que hoje dá trabalho, o que querem saber da corrente e o
   que não querem expor. Roteiro no §8.2.
3. **Teste de vocabulário** (formulário de 3 minutos, 15–30 pessoas da corrente das casas participantes): para
   cada conceito, a pessoa escolhe a palavra que usaria e marca as que não entende (§6).
4. **Mapa da jornada atual** a partir das conversas: entrada, saber da gira, avisos, pagar, faxina e presença,
   com os pontos de atrito.

### Semana 2 — Protótipo
5. **Protótipo navegável no celular** (HTML com a cara do GiraHub, terreiro fictício, link aberto pelo WhatsApp),
   cobrindo as jornadas J1 a J9 (§7) e a versão do dirigente de J10 a J13.
6. **Teste de primeiro toque** (10 pessoas, assíncrono): mostra o Início e pergunta "onde você toca para…". Serve
   para validar a ordem do Início e a barra inferior.
7. Ajustes no protótipo.

### Semana 3 — Teste de usabilidade e síntese
8. **Teste moderado** com 5–6 médiuns e 2–3 dirigentes, no celular de cada um, com o link enviado pelo WhatsApp
   (como será na vida real). Roteiro e tarefas no §8.3.
9. **Síntese**: problemas por gravidade (impede · atrasa · incomoda), ajustes no protótipo, glossário final e
   mudanças nos cards.
10. **Rodada curta de confirmação** (2–3 pessoas) se algum problema "impede" exigir mudança grande.

---

## 6. Glossário a validar

Proposta inicial; o teste de vocabulário decide. Coluna "Evitar" = palavras de sistema ou que soam frias.

| Conceito | Opções para testar | Evitar | Observação |
|---|---|---|---|
| Nome da área | Área do Médium · Área da Corrente · Minha Casa · Área do Filho da Casa | Portal, Dashboard | Ogã/ekedi/cambone nem sempre se veem como "médium" |
| Entrar | Entrar | Login, Logar | |
| Convite | Convite da casa · Seu acesso | Cadastro, Ativação | |
| Avisos da casa | Avisos · Recados · Comunicados | Notificações, Feed | "Recados" já é usado para o consulente na gira |
| Agenda | Agenda · Calendário · Próximas giras | Eventos | |
| Gira | Gira · Sessão · Trabalho · Toque | | Pode variar por casa (ver §11) |
| Mensalidade | Mensalidade · Contribuição · Contribuição mensal | Cobrança, Fatura, Boleto | "Mensalidade" pode soar comercial |
| Pagar com PIX | Pagar com PIX · Copiar código do PIX · PIX copia e cola | BR Code, txid | "Copia e cola" é termo conhecido do banco |
| Comprovante | Enviar comprovante | Anexar, Upload | |
| Em conferência | Aguardando a casa confirmar · Em conferência | Pendente, Em análise | |
| Escala | Escala · Sua vez · Você está na escala | Alocação, Convocação | |
| Convocado | Escalado · Chamado · Contamos com você | Convocado | "Convocado" soa militar |
| Vou / Não vou | Vou · Não vou · Não posso ir | Confirmar presença / Recusar | |
| Justificativa | Motivo · Conte o motivo · Justificar a falta | Justificativa obrigatória | Tom acolhedor, nunca de cobrança |
| Marcar presença | Cheguei · Estou na casa · Marcar presença | Check-in | |
| Faxina | Faxina · Limpeza · Zeladoria · Cuidado da casa | | Varia por casa |
| Grupo | Grupo · Turma · Equipe | Squad, Time | G1/G2/G3 é como o dono descreveu |
| Trocar de área | Ir para o painel do terreiro · Ir para a Área do Médium | Trocar de contexto | Só para quem tem as duas |
| Perfil | Meus dados · Meu perfil | Conta, Configurações | |

**Atenção**: no GiraHub, "senha" já quer dizer a ficha de atendimento do consulente. Na Área do Médium, "senha"
será a senha de acesso. Testar se isso confunde (ex.: "Crie sua senha de acesso").

---

## 7. Jornadas a desenhar e testar

Cada jornada tem uma meta de toques e de tempo. Essas metas viram aceite de UX dos cards.

| # | Jornada | Card | Meta |
|---|---|---|---|
| J1 | Receber o convite no WhatsApp, criar a senha, aceitar o termo e cair no Início | AM-03 | ≤ 4 telas, ≤ 2 min, sem ajuda |
| J2 | Voltar no dia seguinte e entrar (link salvo, site ou ícone) | AM-04/AM-16 | ≤ 3 toques até o Início |
| J3 | Operador-médium: entrar, escolher a área, trocar de área depois | AM-04 | Entende a escolha sem explicação |
| J4 | Saber quando é a próxima gira e o que levar | AM-06/AM-07 | ≤ 2 toques do Início, ≤ 30 s |
| J5 | Pôr a gira na agenda do celular e divulgar no WhatsApp | AM-07 | Funciona no Android e no iPhone pelo navegador do WhatsApp |
| J6 | Ler um aviso novo da casa | AM-09 | 1 toque do Início |
| J7 | Pagar a mensalidade do mês com PIX copia e cola e enviar o comprovante | AM-11/AM-12 | ≤ 3 min, ≥ 80% sem ajuda |
| J8 | Ver que o comprovante foi recusado, entender o motivo e reenviar | AM-12 | Entende o motivo e a próxima ação |
| J9 | Ver a escala de faxina, responder "não vou" com motivo, marcar presença no dia | AM-17/AM-25/AM-28 | ≤ 3 toques + o texto |
| J10 | Dirigente: convidar um médium pelo WhatsApp e ver quem já entrou | AM-03 | ≤ 1 min por médium |
| J11 | Dirigente: publicar um aviso e ver quem leu | AM-09 | ≤ 2 min no celular |
| J12 | Dirigente: conferir e confirmar um comprovante | AM-12 | ≤ 30 s por comprovante |
| J13 | Dirigente: montar a faxina do mês com G1/G2/G3 e publicar | AM-25 | ≤ 5 min, entende "copiar mês anterior" |

O protótipo cobre J1 a J13. Ficam fora: perfil (AM-13), multi-terreiro (AM-05) e as fases 2 e 3.

---

## 8. Roteiros

### 8.1 Conversa com médium (20–30 min)
1. Há quanto tempo está na casa? Que função tem na corrente? (Só para o perfil; não anotar entidade.)
2. Como você fica sabendo que vai ter gira? E do que precisa levar?
3. Como recebe os avisos da casa? Já perdeu algum aviso importante? O que aconteceu?
4. Como paga a mensalidade (ou contribuição) hoje? Como a casa sabe que você pagou?
5. Tem faxina ou escala na casa? Como você sabe quando é a sua vez? E quando não pode ir?
6. Que aplicativos você usa todo dia? Quando recebe um link no WhatsApp, o que faz?
7. Se a casa tivesse um lugar só para a corrente no celular, o que você queria ver primeiro?
8. Como você chamaria esse lugar? (Não sugerir nomes antes.)
9. Tem algo que você **não** gostaria que aparecesse ali?

### 8.2 Conversa com dirigente (30 min)
1. O que mais dá trabalho para organizar a corrente hoje?
2. Como avisa a corrente? O que se perde no grupo?
3. Como controla a mensalidade? Quanto tempo leva por mês?
4. Como monta a faxina e a escala de gira? Mostre como fez no mês passado (papel, foto ou planilha).
5. Faz chamada ou controla presença? Como trata a falta?
6. O que você quer saber da corrente pelo sistema? O que você acha que **não** deve controlar?
7. Quem na casa faria isso no sistema: você, o tesoureiro ou alguém da Porta?

### 8.3 Teste de usabilidade (40 min)
Abertura: "Estamos testando o aplicativo, não você. Não existe resposta errada. Pense em voz alta."
Para cada tarefa: ler a tarefa, observar sem ajudar, anotar onde travou, perguntar no fim "de 1 a 7, quanto foi
fácil?".

Médium (link enviado pelo WhatsApp):
1. "A casa mandou um convite. Entre e deixe seu acesso pronto." (J1)
2. "Quando é a próxima gira e o que você precisa levar?" (J4)
3. "Coloque essa gira na agenda do seu celular." (J5)
4. "Tem um aviso novo da casa. O que ele diz?" (J6)
5. "Pague a mensalidade de outubro. Mostre como faria no seu banco, sem pagar de verdade, e mande o
   comprovante; use esta imagem de exemplo." (J7)
6. "A casa recusou o comprovante. O que aconteceu e o que você faz?" (J8)
7. "Você não vai poder ir à faxina de sábado. Avise a casa." (J9)
8. "Feche o app. Amanhã, como você entra de novo?" (J2)

Fechamento: "O que foi mais fácil? O que foi mais chato? Você indicaria para alguém da corrente? Por quê?"

Dirigente: J10 a J13, no celular.

### 8.4 Registro por sessão
Planilha simples: participante · perfil · aparelho · tarefa · concluiu (sim · com ajuda · não) · tempo · nota de
1 a 7 · onde travou · frase marcante.

---

## 9. O que conta como sucesso

| Métrica | Meta para liberar o desenvolvimento das telas |
|---|---|
| Tarefas de médium concluídas sem ajuda | ≥ 80% em cada tarefa |
| Nota de facilidade (1 a 7) por tarefa | média ≥ 5,5 |
| Termos do glossário entendidos sem explicação | ≥ 80% das pessoas para o termo escolhido |
| Problemas que "impedem" a tarefa | zero em aberto no protótipo final |
| Primeiro toque certo no Início | ≥ 80% |

Se uma jornada não bater a meta, ela muda no protótipo e é testada de novo antes de virar card de desenvolvimento.

---

## 10. Entregáveis e como entram nos cards

1. **Relatório de descoberta**: jornada atual, dores e frases marcantes, anonimizados.
2. **Glossário da Área**, com termo escolhido, onde usar e o que evitar. Vira fonte única dos textos, e os textos
   do front passam a ser revisados contra ele.
3. **Protótipo validado** (link): referência visual e de fluxo de cada card.
4. **Princípios de UX** (§3), revisados com o que o teste mostrar.
5. **Mudanças nos cards AM**: escopo, ordem e aceite. Todo card com tela ganha os itens de aceite:
   - "Telas e textos conforme o protótipo validado e o glossário do AM-00";
   - "Testado em 360 px, com a fonte do Android em 130% e aberto pelo navegador do WhatsApp".
6. **Atualização do plano** ([plano-area-do-medium.md](plano-area-do-medium.md)): decisões que mudarem
   (ex.: nome da área) entram na §12 com data.

---

## 11. Perguntas em aberto para o dono

1. **Incentivo**: dar 1 mês grátis às casas participantes?
2. **Vocabulário por casa**: se o teste mostrar que as casas falam diferente ("gira" × "toque", "mensalidade" ×
   "contribuição"), vale deixar a casa escolher o termo em Configurações? Isso aumenta o escopo do AM-10.
3. **Casas participantes**: quais 3 ou 4 casas convidar?

---

## 12. Mensagem para convidar as casas (o dono envia)

> Oi, [nome]! Tudo bem? Estamos criando no GiraHub um espaço para a corrente da casa: agenda das giras, avisos,
> mensalidade pelo PIX e escala de faxina, tudo no celular de cada médium. Antes de construir, queremos ouvir quem
> vai usar. Você toparia indicar 2 ou 3 pessoas da corrente (de idades diferentes) para uma conversa de 20 minutos
> por vídeo no WhatsApp? E também conversar 30 minutos com você sobre como a casa se organiza hoje. Nada é
> gravado sem autorização e nenhum dado da casa é usado. Como agradecimento, [incentivo]. Pode ser?
