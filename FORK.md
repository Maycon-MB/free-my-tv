# Fork do Maycon

Fork de [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv) (MIT) ajustado para uma LG
webOS 25 com 1,2 GB de RAM. O README e o CLAUDE.md do original continuam valendo; aqui fica só o que muda.

## O que muda

| Recurso | Onde |
|---|---|
| Tema escuro do portfólio (vermelho `#E5484D`, JetBrains Mono, sem sombras) e constelação de fundo | `web/maycon.css`, `web/home.js` |
| Logos vetoriais nos apps conhecidos, nome do app focado, todos os apps na prateleira | `web/home.js` |
| Segurar OK num app (tecla ou ponteiro) move ele; ← → muda a posição, OK solta | `web/home.js` |
| Pesquisa no TMDB com filtros (tipo, gênero, só meus apps) e aviso de aluguel/compra | `web/home.js`, `web/data.js` |
| Abre direto no título: Netflix (testado), Prime, Disney+, Max, Apple TV, Globoplay (a testar), ids do Wikidata | `web/data.js`, `web/home.js` |
| Segurar OK num título do Explorar ou da pesquisa abre o trailer no YouTube | `web/data.js`, `web/home.js` |
| Pesquisa sem texto mostra os títulos abertos recentemente; opção "Ordem dos apps: Mais usados" | `web/home.js` |
| Perfis nas Configurações da Home: ordem dos apps, tema, cor de destaque, modo infantil | `web/home.js`, `web/accents.css` |
| Jogo do Flamengo ao lado das abas (API pública da ESPN pelo serviço) e aviso de gol por cima de outros apps | `webos/service/service.js`, `web/home.js` |
| Gaveta: apagar tela, mudo e timer que desliga a TV (API de controle remoto; a TV pede Permitir uma vez) | `webos/service/service.js`, `web/tv.js`, `web/home.js` |
| Destaque do Explorar girando (ligado) e constelação animada (desligada), nas Configurações da Home | `web/home.js` |
| Explorar com até 6 títulos, o que passa no Brasil primeiro, selo com o ícone do app, Claro tv+ | `web/data.js`, `web/home.js` |
| Painel de desempenho na gaveta (CPU, RAM, swap, rede lidos de `/proc`); no topo só alerta | `webos/service/service.js`, `web/tv.js`, `web/home.js` |
| Voltar não sai para a home da LG; fotos da proteção de tela em 1280 px e liberadas ao sair | `web/home.js` |
| App registrado como entrada da TV (`supportGIP`), para ligar direto nele com "última entrada" | `webos/appinfo.json` |

## Instalar nesta TV

```bash
python webos/apps.py <IP>      # só após instalar ou remover apps; a TV pede "Permitir"
python webos/build.py
python webos/install.py <IP>   # 1ª vez pede a senha do Developer Mode, digitada no terminal
```

`web/accents.css` é gerado a partir das cores de `web/maycon.css` (vermelho trocado por azul, verde, roxo, laranja
e amarelo); ao mudar uma cor de destaque em `maycon.css`, gere de novo.

Fica fora do git e precisa existir na máquina: `config.properties` (cidade, chave do TMDB),
`webos-apps.local.json` e `webos-icons.local/` (gerados pelo `apps.py`) e as fontes `web/mono-500.woff2` e
`web/mono-700.woff2` (JetBrains Mono, OFL, `latin-500/700-normal.woff2` do Fontsource).

Entrada da TV, uma vez por instalação nova:
`luna-send-pub -n 1 luna://com.webos.service.eim/addDevice '{"appId":"io.freemytv","pigImage":"","mvpdIcon":""}'`
pelo SSH da TV (`deleteDevice` desfaz). Depois, nas configurações da TV, ligar na última entrada.

## Developer Mode sem vencer

A sessão dura 1000 h. `%USERPROFILE%\.freemytv\renovar-devmode.ps1` chama `ResetDevModeSession` da LG com o
token lido da TV (`/var/luna/preferences/devmode_enabled`, guardado em `.freemytv\devmode_token`) e grava em
`renovacao.log` (tenta 3 vezes, um minuto entre elas, e grava só o tipo do erro). A tarefa agendada
`FreeMyTV-RenovarDevMode` roda aos domingos às 20h e a cada login; basta o notebook ligar uma vez em 40 dias.
O token nunca entra no repositório.

## A testar na TV

- Abrir no título em Prime, Disney+, Max, Apple TV e Globoplay (formato do link inferido).
- Timer, apagar tela, mudo e aviso de gol (permissões novas da API de controle remoto).
- O app na lista de Entradas e a TV ligando nele com "última entrada", inclusive depois de tirar da tomada.

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
