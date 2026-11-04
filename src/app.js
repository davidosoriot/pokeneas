const path = require('node:path');
const express = require('express');
const pokeneaRoutes = require('./routes/pokeneaRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

// Swarm balancea por conexión: sin esto el navegador reutiliza la conexión
// keep-alive y cada recarga cae siempre en el mismo contenedor
app.use((req, res, next) => {
  res.set({ Connection: 'close', 'Cache-Control': 'no-store' });
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(pokeneaRoutes);

module.exports = app;
