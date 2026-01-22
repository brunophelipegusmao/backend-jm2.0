# Fluxo de login e completar perfil

## Endpoints principais
- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-in/social` (provider: `google`)
- `POST /api/auth/sign-out` (logout do Better Auth)
- `POST /auth/logout` (logout via Nest)
- `POST /auth/password` (definir senha manual, exige sessao)
- `POST /api/auth/set-password` (alternativa Better Auth)

## Fluxo recomendado (cadastro + completar perfil)
1) Cadastro com email/senha: `POST /api/auth/sign-up/email`.
2) Login com email/senha: `POST /api/auth/sign-in/email`.
3) Login com Google: `POST /api/auth/sign-in/social` com `provider: "google"`.
4) Logo apos login:
   - `GET /users/me/status` para saber se falta CPF ou health.
   - Se `cpfFilled === false` ou `healthFilled === false`, redirecione para a tela de completar cadastro.
5) Completar perfil:
   - `PATCH /users/me/profile` para CPF/telefone/endereco/nome/imagem.
   - `POST /health/me` para criar dados de saude (use `PATCH /health/me` para atualizar).

## Novo usuario Google (redirect automatico)
O backend ja injeta `callbackURL` e `newUserCallbackURL` quando nao vier no body.
- `callbackURL` aponta para o painel.
- `newUserCallbackURL` aponta para a tela de completar perfil.

Se voce quiser controlar isso no client, passe esses campos no body do
`POST /api/auth/sign-in/social`.

Se o frontend ainda nao estiver pronto, mantenha os redirects apontando para
`http://localhost:3000/painel` e `http://localhost:3000/complete-profile` e
ajuste depois que o front estiver publicado.

## Link de senha (manual)
Use `GET /users/me/status` e leia `hasPassword`:
- `hasPassword === false`: ofereca o botao "Definir senha".
- `POST /auth/password` com `{ "newPassword": "..." }` para criar a senha.

## Logout
Use um dos endpoints:
- `POST /api/auth/sign-out` (Better Auth)
- `POST /auth/logout` (Nest)

## Admin (MASTER/ADMIN/STAFF)
- `GET /admin/users/:id`
- `PATCH /admin/users/:id`
- `GET /admin/health/:userId`
- `PUT /admin/health/:userId` (upsert)
- `PATCH /admin/health/:userId`

## Dica de client (cookies)
As sessoes usam cookies. Em `fetch`, envie `credentials: "include"`.
