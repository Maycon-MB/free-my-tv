# Fork do Maycon

Fork de [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv) (MIT) ajustado para uma LG
webOS 25 com 1,2 GB de RAM. O README e o CLAUDE.md do original continuam valendo; aqui fica só o que muda.

## Como se usa

Tudo à vista, sem gesto escondido (o padrão de Netflix e YouTube):

- **Topo:** abas Explorar, Filmes, Séries e Minha lista; ícone de rede (verde com barras de sinal, vermelho sem
  rede; OK abre a rede da TV) e os botões Pesquisar, Controles e Ajustes, com nome.
- **Fileira de apps:** ← → percorre, OK abre. Segurar OK num app muda ele de lugar (atalho; também há a ordem
  "Mais usados" nos Ajustes).
- **▼ desce** para Entradas, TV ao vivo, clima, desempenho e ajustes da TV, anunciados no rodapé.
- **OK num filme ou série** abre a página dele: Assistir no app certo, Trailer, + Minha lista, Voltar.
- **Home** ou sair de um app nunca deixa a home da LG na tela: o Free My TV volta sozinho.

## O que muda

| Área | Recurso | Onde |
|---|---|---|
| Visual | Tema do portfólio (escuro, JetBrains Mono, sem sombras); cores Vermelho, Rosa, Azul, Verde, Roxo, Laranja, Amarelo | `web/maycon.css`, `web/accents.css` |
| Visual | Fundo por perfil: constelação (animada, pausa fora da tela inicial), gradiente na cor, foto do destaque ou liso | `web/home.js` |
| Visual | Logos vetoriais e ícones Material Symbols; nome do app focado; até 3 times e F1 no topo | `web/home.js` |
| Navegação | Botões do topo com nome; ▼ para a fileira de entradas e ajustes; só entradas com algo ligado | `web/home.js` |
| Navegação | Página do título com Assistir, Trailer e + Minha lista; aba Minha lista (salvos e recentes) | `web/home.js` |
| Navegação | Séries da Minha lista com selo de novo episódio (últimos 7 dias) ou do próximo (dia da semana) | `web/data.js`, `web/home.js` |
| Navegação | Ícone de rede no topo: verde com 1 a 4 barras (`/proc/net/wireless`), vermelho sem rede; abre a rede da TV | `web/home.js`, `webos/service/service.js` |
| Navegação | Volta sempre ao Free My TV quando a home da LG aparece (serviço assina o app em primeiro plano) | `webos/service/service.js` |
| Apps | Todos os apps na fileira; segurar OK move; ordem manual ou mais usados; Claro tv+, Pluto TV e Mercado Play reconhecidos | `web/home.js`, `web/data.js` |
| Apps | Título em vários apps: um Assistir por app (os mais usados primeiro), ícones nos resultados; conta assinatura, grátis e com anúncios | `web/data.js`, `web/home.js` |
| Apps | Abre no título: Netflix (Wikidata P1874) e Disney+ (P13902, formato da busca da LG); os demais na tela inicial | `web/data.js` |
| Pesquisa | TMDB com filtros; tolera erro de digitação; nome de ator traz os trabalhos dele; seus apps primeiro | `web/data.js` |
| Pesquisa | Resultados ao digitar; QR code para digitar pelo celular (porta 8770, código de 4 dígitos) | `web/home.js`, `webos/service/service.js` |
| Explorar | Até 6 títulos, o que passa no Brasil primeiro, selo com o ícone do app, destaque girando | `web/data.js`, `web/home.js` |
| Perfis | Ordem dos apps, tema, cor, fundo, modo infantil, lista, recentes, notícias/esportes e painel de desempenho | `web/home.js` |
| Esportes | Times escolhidos pelo controle (ESPN), aviso de gol e lembrete 10 min antes, por cima de outros apps | `webos/service/service.js` |
| Controles | Botão Controles: controle pelo celular, só o som (apaga a tela), timer que desliga a TV, teste de velocidade | `web/home.js`, `web/tv.js` |
| Celular | Controle remoto completo (setas, OK, Voltar, Início, volume, play, digitar) em qualquer app; pareia uma vez pelo QR (porta 8770, token guardado) | `webos/service/service.js` |
| TV | Painel de desempenho (CPU, RAM, swap, rede de `/proc`); manchetes do ge e g1 no topo | `webos/service/service.js` |
| TV | Developer Mode renovado pela própria TV, uma vez por dia; backup das configurações; app como entrada | `webos/service/service.js`, `webos/backup.py` |
| Memória | Fotos em 1280 px, liberadas ao sair; só o cartão em destaque guarda a foto grande; pesquisa e página do título soltam as imagens ao fechar | `web/home.js` |

## Instalar nesta TV

```bash
python webos/apps.py <IP>      # só após instalar ou remover apps; a TV pede "Permitir"
python webos/build.py
python webos/install.py <IP>   # 1ª vez pede a senha do Developer Mode, digitada no terminal
```

`web/accents.css` é gerado por `python tools/make_accents.py` a partir das cores de `web/maycon.css` (vermelho trocado por azul, verde, roxo, laranja
e amarelo); ao mudar uma cor de destaque em `maycon.css`, gere de novo.

Fica fora do git e precisa existir na máquina: `config.properties` (cidade, chave do TMDB),
`webos-apps.local.json` e `webos-icons.local/` (gerados pelo `apps.py`) e as fontes `web/mono-500.woff2` e
`web/mono-700.woff2` (JetBrains Mono, OFL, `latin-500/700-normal.woff2` do Fontsource).

Entrada da TV, uma vez por instalação nova:
`luna-send-pub -n 1 luna://com.webos.service.eim/addDevice '{"appId":"io.freemytv","pigImage":"","mvpdIcon":""}'`
pelo SSH da TV (`deleteDevice` desfaz). Depois, nas configurações da TV, ligar na última entrada.

## Developer Mode sem vencer

A sessão dura 1000 h e, se acabar, a TV apaga o app. Três renovações, nenhuma depende de lembrar:

1. **A própria TV** (principal): o serviço lê o token (`/var/luna/preferences/devmode_enabled`) e chama
   `ResetDevModeSession` da LG uma vez por dia, quando o app abre. Confirmado na TV em 2026-11-02.
2. **GitHub** (reserva): o repositório privado `Maycon-MB/tv-devmode-renovar` renova toda segunda, com o token no
   segredo `LG_DEVMODE_TOKEN`.
3. **Notebook** (redundante): `%USERPROFILE%\.freemytv
enovar-devmode.ps1` pela tarefa `FreeMyTV-RenovarDevMode`.

Se o Developer Mode for desligado e ligado de novo, o token muda: atualize o segredo do GitHub. O token nunca entra
neste repositório.

## Confirmado na TV e a testar

Confirmado (webOS 25): renovação pela TV, volta ao Free My TV pelo Home, Netflix e Disney+ no título, trailer,
pesquisa pelo celular e QR code, manchetes, F1, futebol, permissões da API de controle remoto.

A testar (instalação pendente: a TV estava desligada): controle pelo celular (a TV pede Permitir de novo pelas
permissões de teclado e ponteiro), ícone de rede e barras de sinal, medir a memória, timer até desligar, só o som, aviso de gol com jogo ao vivo, a TV ligando no app pela "última entrada"
(inclusive depois de tirar da tomada) e o roteiro de abrir no título em outros apps (fim deste arquivo).

## Atualizar com o original

```bash
git fetch upstream
git switch main && git merge --ff-only upstream/main && git push origin main
git switch <branch> && git rebase main
```

Conflitos costumam cair em `web/home.js` e `web/data.js`; o tema fica isolado em `web/maycon.css`.

## Backup das configurações

O app grava as configurações em `/media/developer/temp/freemytv-backup.json` na TV a cada mudança.
`python webos/backup.py <IP>` copia para `~/.freemytv/backups/`; depois de reinstalar,
`python webos/backup.py <IP> --restore` devolve a cópia mais nova e o app a carrega ao abrir vazio.

## Como desfazer tudo

1. `python webos/install.py <IP> --uninstall` remove o app (a home da LG nunca foi alterada).
2. Pelo SSH da TV: `luna-send-pub -n 1 luna://com.webos.service.eim/deleteDevice '{"appId":"io.freemytv"}'`
   tira a entrada da TV.
3. `Unregister-ScheduledTask FreeMyTV-RenovarDevMode` e apagar `%USERPROFILE%\.freemytv` param a renovação.
4. No app Developer Mode da TV, desligar o Dev Mode Status.

## Roteiro: abrir no título em mais apps

Netflix e Disney+ já abrem no título. Para os outros, a busca da própria LG lança o app com
`replaceParams.deeplinkingParams` e o app usa o modelo de link do seu `appinfo.json` (estudo do projeto
[Glasshouse](https://github.com/rorygallagher2024/glasshouse/blob/main/docs/development/TV-RESEARCH.md)). Teste pelo
SSH da TV, com o app fechado e depois aberto, e anote se abriu no título:

```sh
L=luna://com.webos.applicationManager/launch
luna-send-pub -n 1 $L '{"id":"amazon","replaceParams":{"deeplinkingParams":{"target":"$CONTENTID","value":"B09QH98YG1"}}}'
luna-send-pub -n 1 $L '{"id":"com.wbd.stream","replaceParams":{"deeplinkingParams":{"target":"$CONTENTID","value":"urn:hbo:series:GWukCJAq-nIuHwwEAAAB4"}}}'
luna-send-pub -n 1 $L '{"id":"com.apple.appletv","replaceParams":{"deeplinkingParams":{"target":"$CONTENTID","value":"umc.cmc.vtoh0mn0xn7t3c643xqonfzy"}}}'
luna-send-pub -n 1 $L '{"id":"globoplaywebos","replaceParams":{"deeplinkingParams":{"target":"$CONTENTID","value":"MyCrVrr6gW"}}}'
```

Títulos: Os Anéis de Poder (Prime, ASIN do Wikidata P8055), Succession (Max, P8298), Ted Lasso (Apple TV, P9751;
o estudo diz que o Apple TV ignorou o id da série), amostra do Globoplay (P12356). O que abrir no título entra em
`TITLE_LINKS` (`web/data.js`). Se a LG recusar `replaceParams` vindo de app de desenvolvedor, a alternativa é a
busca da LG (`com.webos.service.nlpmanager/search` + `com.webos.service.sdx/send`), que traz o id exato de cada app.
