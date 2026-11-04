const os = require('node:os');
const pokeneas = require('../data/pokeneas');
const { imagesBaseUrl } = require('../config');

function getRandomPokenea() {
  return pokeneas[Math.floor(Math.random() * pokeneas.length)];
}

// Dentro de un contenedor Docker el hostname es el id corto del contenedor
function getContainerId() {
  return os.hostname();
}

function getImageUrl(pokenea) {
  return `${imagesBaseUrl}/${pokenea.imagen}`;
}

module.exports = { getRandomPokenea, getContainerId, getImageUrl };
