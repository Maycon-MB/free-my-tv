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
| Netflix abre direto no título (id via Wikidata P1874, sem chave) | `web/data.js`, `web/home.js` |
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

Fica fora do git e precisa existir na máquina: `config.properties` (cidade, chave do TMDB),
`webos-apps.local.json` e `webos-icons.local/` (gerados pelo `apps.py`) e as fontes `web/mono-500.woff2` e
`web/mono-700.woff2` (JetBrains Mono, OFL, `latin-500/700-normal.woff2` do Fontsource).

Entrada da TV, uma vez por instalação nova:
`luna-send-pub -n 1 luna://com.webos.service.eim/addDevice '{"appId":"io.freemytv","pigImage":"","mvpdIcon":""}'`
pelo SSH da TV (`deleteDevice` desfaz). Depois, nas configurações da TV, ligar na última entrada.

## Developer Mode sem vencer

A sessão dura 1000 h. `%USERPROFILE%\.freemytv\renovar-devmode.ps1` chama `ResetDevModeSession` da LG com o
token lido da TV (`/var/luna/preferences/devmode_enabled`, guardado em `.freemytv\devmode_token`) e grava em
`renovacao.log`. A tarefa agendada `FreeMyTV-RenovarDevMode` roda aos domingos e no login. O token nunca entra
no repositório.

## Atualizar com o original

```bash
git fetch upstream
git switch main && git merge --ff-only upstream/main && git push origin main
git switch <branch> && git rebase main
```

Conflitos costumam cair em `web/home.js` e `web/data.js`; o tema fica isolado em `web/maycon.css`.
