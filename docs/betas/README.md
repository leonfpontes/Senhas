# Betas do GiraHub — o Laboratório

Decisão do dono em 01/11/2026: o que é novo nas jornadas v2 entra como **beta**.

## Como funciona
1. A plataforma marca o terreiro como **beta tester** em `/platform` (detalhe do terreiro, chave "Beta tester"). Fica em `tenants.beta_tester` (migração 102).
2. Só então a casa vê **Configurações › Laboratório (beta)** e liga ou desliga cada beta. A escolha fica em `feature_flags`, com a chave `beta_<nome>`.
3. Uma beta só vale com as duas coisas. No backend, `services/laboratorio.beta_ligada(db, tenant_id, chave)`; na página do consulente, a lista `betas` da resposta de `/api/v1/public/gira/{id}`.
4. **Desligar não apaga dado**: o que a casa registrou com a beta continua no banco e volta ao ligar.

## Catálogo
O catálogo é único: `backend/src/services/laboratorio.py` (`CATALOGO`). Toda beta nova entra nele, ganha um arquivo aqui e uma entrada em **Notas da versão · Beta testers** (`frontend/src/constants/releaseNotes.ts`, `BETA_RELEASE_NOTES`).

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
| [Menu que se ajusta ao uso](beta_menu_ajustavel.md) | `beta_menu_ajustavel` | Para o painel |
| [Indicação do plano pelo uso](beta_indicacao_plano.md) | `beta_indicacao_plano` | Para o painel |
