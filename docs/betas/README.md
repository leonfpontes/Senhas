# Betas do GiraHub — o Laboratório

Decisão do dono em 01/11/2026: o que é novo nas jornadas v2 entra como **beta**.

## Como funciona
1. A plataforma marca o terreiro como **beta tester** em `/platform` (detalhe do terreiro, chave "Beta tester"). Fica em `tenants.beta_tester` (migração 102). **É a única chave da plataforma** (decisão do dono, 19/11/2026): nada de interruptor por funcionalidade no backoffice, nem para beta com custo do GiraHub (como a IA). O detalhe do terreiro só mostra, para leitura, as betas que a casa ligou (`betas_ligadas`).
2. Só então a casa vê **Configurações › Laboratório (beta)** e liga ou desliga cada beta. A escolha fica em `feature_flags`, com a chave `beta_<nome>`.
3. Uma beta só vale com as duas coisas. No backend, `services/laboratorio.beta_ligada(db, tenant_id, chave)`; na página do consulente, a lista `betas` da resposta de `/api/v1/public/gira/{id}`.
4. **Beta que também pede um recurso do plano** (ex.: a Área do Médium, Basic+) diz qual em `Beta.plano`. O Laboratório mostra a beta em qualquer plano e avisa o plano que falta; o gate de plano continua valendo no uso.
5. **Desligar não apaga dado**: o que a casa registrou com a beta continua no banco e volta ao ligar.

## Catálogo
O catálogo é único: `backend/src/services/laboratorio.py` (`CATALOGO`). Toda beta nova entra nele, ganha um arquivo aqui e uma entrada em **Notas da versão · Beta testers** (`frontend/src/constants/releaseNotes.ts`, `BETA_RELEASE_NOTES`; um teste confere que toda beta do catálogo tem nota).

## A nota da versão de cada beta
É o que a casa lê ao tocar em "Nota da versão" no Laboratório e em "Notas da versão · Beta testers". Não repete a descrição curta da linha: explica em linguagem do terreiro, sem termo técnico, em quatro partes fixas e uma opcional:
- **O que faz**: o problema da casa que ela resolve, em poucas frases;
- **Como usar**: o passo a passo, com o nome dos botões como aparecem na tela;
- **Quem vê**: quem enxerga e quem pode mexer (consulente, médium, quem tem tal permissão, plano);
- **Ao desligar**: o que some e o que fica guardado (nada do que a casa registrou se perde);
- **Bom saber** (opcional): o que evita surpresa, como limites, o que não é copiado e cuidados.

Sem urgência, sem promessa e sem confirmshaming (regras de design ético do projeto). Cada arquivo desta pasta repete a nota no fim, em "Nota da versão".

## Promover ou retirar
- **Promover para todos**: tirar a checagem de `beta_ligada` no código, manter este arquivo (vira "Promovida em <data>") e a nota de versão normal.
- **Retirar**: tirar do catálogo, desligar para todos e registrar nas notas de beta.

| Beta | Chave | Grupo |
|---|---|---|
| [Receber a senha de novo](beta_receber_senha_de_novo.md) | `beta_receber_senha_de_novo` | Para o consulente |
| [Bilhete sem internet](beta_bilhete_offline.md) | `beta_bilhete_offline` | Para o consulente |
| [Senha para outra pessoa](beta_senha_para_outra_pessoa.md) | `beta_senha_para_outra_pessoa` | Para o consulente |
| [Repetir a gira em outra data](beta_repetir_gira.md) | `beta_repetir_gira` | Para a gira |
| [Cartaz do portão](beta_cartaz_portao.md) | `beta_cartaz_portao` | Para a gira |
| [Lembrete no dia da gira](beta_lembrete_dia_gira.md) | `beta_lembrete_dia_gira` | Para a gira |
| [Avisar quem tem senha quando a gira é excluída](beta_avisar_exclusao_gira.md) | `beta_avisar_exclusao_gira` | Para a gira |
| [Retorno do consulente na porta](beta_retorno_consulente.md) | `beta_retorno_consulente` | Para a porta |
| [Menu que se ajusta ao uso](beta_menu_ajustavel.md) | `beta_menu_ajustavel` | Para o painel |
| [Indicação do plano pelo uso](beta_indicacao_plano.md) | `beta_indicacao_plano` | Para o painel |
| [Novo construtor do site](beta_novo_construtor_site.md) | `beta_novo_construtor_site` | Para o site |
| [Textos do site com IA](beta_textos_ia_site.md) | `beta_textos_ia_site` | Para o site |
| [Área do Médium](beta_area_medium.md) | `beta_area_medium` | Para a corrente |
| [Assistente de plano no site](assistente_plano_site.md) | `NEXT_PUBLIC_ASSISTENTE_PLANO` (chave do site, fora do Laboratório) | Para o site |
