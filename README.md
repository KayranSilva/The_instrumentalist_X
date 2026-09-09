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