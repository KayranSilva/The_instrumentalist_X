# The Instrumentalist X

## Frontend

Os scripts do frontend ficam em `FrontEnd/src` como TypeScript. Para gerar os arquivos JavaScript consumidos pelas páginas HTML:

```bash
npm install
npm run build
```

Para verificar os tipos sem gerar arquivos:

```bash
npm run typecheck
```

O backend Python mantém as rotas `/login`, `/recover` e `/homepage` usadas pelo frontend.

## Administração

Inicie o backend com:

```bash
python3 BackEnd/login.py
```

Abra `http://localhost:8001/` no navegador. O próprio backend serve o painel administrativo e seus assets. A chave inicial do painel é `admin123`; em produção, defina `INSTRUMENTALIST_ADMIN_KEY` antes de iniciar o backend.

O painel permite publicar e remover músicas, partituras e aulas. Os registros ficam em `BackEnd/content.json` e são disponibilizados pelas rotas administrativas `GET /admin/content`, `POST /admin/content` e `DELETE /admin/content/{id}`.