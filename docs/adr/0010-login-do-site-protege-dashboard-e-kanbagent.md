# 0010. Proteger dashboard e kanbagent com o login que o site já tem

- Status: Aceito
- Data: 2026-11-24
- Substitui: a parte de acesso do [0009](0009-kanbagent-pagina-com-escrita-protegida.md)
  (Cloudflare Access); o resto do 0009 continua valendo.

## Contexto
O ADR 0009 pôs dashboard e kanbagent atrás do Cloudflare Access, o que exige configuração manual no
painel da Cloudflare antes de subir. O site já tem um login próprio, configurado e em produção: a senha
do chat privado (`web_chat.login`, `HERMES_WEB_CHAT_PASSWORD_HASH` + `HERMES_WEB_CHAT_SESSION_SECRET`),
com sessão Flask de 7 dias, cookie `HttpOnly`/`Secure`/`SameSite=Strict`, limite de tentativas por IP e
token CSRF para escrita. O Sato quer só a página principal pública, sem passo manual de infraestrutura.

## Decisão
- **Um login só para o site**: a mesma sessão do chat privado autoriza dashboard e kanbagent. A lógica de
  sessão sai de `web_chat.py` para um módulo `hermes_dashboard/auth.py` usado pelos três.
- **Só a home é pública.** Lista explícita de rotas públicas; todo o resto exige sessão:
  - `/`, `/assets/*`, `/static/*`, `/healthz` (se existir);
  - chat da home: `/api/lab/hermes-chat/*` (cada rota segue com a própria regra atual: sessão, login,
    estado), `/api/lab/chat`, `/api/sato-agent/*`.
- A verificação é um `before_request` único em `app.py` que consulta essa lista; rota nova nasce
  protegida. Sem sessão: páginas HTML redirecionam para uma tela de login; `/api/*` e `/fragments/*`
  respondem 401 JSON.
- Escrita (POST) em áreas protegidas exige o mesmo CSRF do chat.
- A API do kanbagent para o Hermes (`/kanbagent/api/*`) aceita, em vez da sessão,
  `Authorization: Bearer <KANBAGENT_API_TOKEN>`; sem token configurado, só sessão.
- Se o login não estiver configurado (hash ou segredo vazio), áreas protegidas respondem 503 com
  "login não configurado", em vez de ficarem abertas.
- Cloudflare Access deixa de ser requisito. Pode ser adicionado no futuro como camada extra.

## Consequências
- Sobe sem nenhuma configuração nova: a senha é a que o Sato já usa no chat.
- Vale também pela rede local (porta 8080), porque a checagem é no app.
- O dashboard deixa de ser público: telemetria, memória, RAG e cron passam a exigir login.
- Senha única: vazou, vaza tudo. Mitigado pelo limite de tentativas e pela troca do hash no `.env`.
- `tests/test_routes.py` e os testes Playwright do dashboard passam a autenticar antes de navegar.

## Alternativas consideradas
- Cloudflare Access (ADR 0009): bom, mas exige passo manual no painel e não cobre a rede local.
- Login separado para o dashboard: duas senhas para uma pessoa, sem ganho.

## Revisitar quando
Houver mais de um usuário, ou o Sato quiser login sem senha (Access, passkey).
