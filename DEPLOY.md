# Deploy (Easypanel)

## Evitar SIGTERM / npm error

O contentor deve arrancar com **`node index.js`**, não com `npm start`.

- **Se no Easypanel existir o campo "Start Command" ou "Command":** defina-o como `node index.js` (ou deixe vazio para usar o CMD do Dockerfile).
- **Não use** `npm start` como comando de arranque — o processo principal deve ser o Node, para que o SIGTERM seja recebido correctamente.

Depois de alterar, faça **Restart** do serviço.
