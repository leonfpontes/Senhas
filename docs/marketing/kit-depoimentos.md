# Kit de coleta de depoimentos (V-01)

Para a seção de depoimentos da landing (V-03). **Só depoimentos reais, com autorização por escrito.**
Concorrentes que usam depoimentos genéricos ficam com cara de falso; o nosso diferencial é ser verdade.

> Este repositório é público: **nunca** versionar nome de terreiro, contato, foto ou autorização aqui.
> As autorizações ficam guardadas fora do repo (pasta privada do dono). Na constante
> `frontend/src/constants/testimonials.ts` entra só o que foi autorizado para publicação.

## Quem convidar

Os terreiros mais ativos dos últimos 90 dias (consulta no painel da plataforma, aba Tenants, ou no card V-01
do Trello). Priorize quem usa a Porta/Modo TV em gira cheia: são os relatos mais fortes.

## Mensagem de convite (WhatsApp)

> Axé, [nome]! Aqui é o Leonardo, do GiraHub. Vi que a [casa] já organizou [N] giras com a gente, e isso
> me deixou muito feliz. Estamos renovando o site e queria contar a experiência de terreiros de verdade.
> Você toparia mandar 2 ou 3 frases sobre como era a gira antes e como ficou com a senha pelo celular?
> Se puder, uma foto sua (ou da casa) e o @ do Instagram. Só publicamos com a sua autorização, e você
> pode pedir para tirar a qualquer momento. 🙏

## Roteiro (3 perguntas)

1. Como era a chegada dos consulentes antes do GiraHub? (fila, papelzinho, horário…)
2. O que mudou na primeira gira com senha pelo celular?
3. O que você mais gosta hoje? (Porta, TV, relatório, fila de espera…)

Pedir também: **nome como quer ser chamado(a)** (ex.: "Mãe Maria de Oxum"), **nome da casa**, **cidade/UF**,
**@instagram** (opcional) e **foto** (rosto ou fachada; boa luz; horizontal ou quadrada).

Aproveitar para pedir **fotos de gira** (ambiente, atabaques, velas, sem rosto de consulente) para o
topo do site (V-08): autorização separada, abaixo.

## Termo de autorização (enviar por escrito e receber "autorizo" por escrito)

> Eu, [nome civil], responsável pela [casa], autorizo o GiraHub a publicar no site girahub.com.br e nas
> redes sociais do GiraHub o depoimento abaixo, junto com [ ] meu nome religioso [ ] o nome da casa
> [ ] a cidade [ ] a foto enviada [ ] o @instagram. Sei que essas informações revelam minha religião e
> concordo com a publicação para essa finalidade. Posso pedir a retirada a qualquer momento pelo
> WhatsApp ou e-mail do GiraHub, e ela será feita em até 7 dias.
>
> Fotos de gira: [ ] autorizo o uso das fotos enviadas no site do GiraHub. Declaro que as pessoas que
> aparecem nelas também autorizaram.
>
> Data: __/__/____

Base legal: consentimento específico e destacado (LGPD art. 11, I), porque é dado de convicção religiosa.

## Registro (planilha privada do dono)

| Data | Casa | Quem | Texto aprovado | Itens autorizados | Arquivo da autorização | Publicado em |
|---|---|---|---|---|---|---|

## Publicar

Depois da autorização, adicionar em `frontend/src/constants/testimonials.ts` (campo `autorizadoEm` com a data)
e a foto em `frontend/public/landing/depoimentos/<slug>.webp` (largura máx. 400 px). A seção aparece
sozinha quando a lista tem pelo menos 1 item.

## Retirada

Pedido de retirada → remover da constante e da pasta de fotos, fazer deploy e anotar a data na planilha.
