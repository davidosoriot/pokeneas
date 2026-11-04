const app = require('./app');
const { port } = require('./config');

const server = app.listen(port, () => {
  console.log(`Pokeneas escuchando en el puerto ${port}`);
});

// Permite que Swarm detenga los contenedores sin esperar el timeout
process.on('SIGTERM', () => server.close(() => process.exit(0)));
