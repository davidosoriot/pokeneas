const pokeneaService = require('../services/pokeneaService');

function showJson(req, res) {
  const { id, nombre, altura, habilidad } = pokeneaService.getRandomPokenea();

  res.json({
    id,
    nombre,
    altura,
    habilidad,
    contenedorId: pokeneaService.getContainerId(),
  });
}

function showPage(req, res) {
  const pokenea = pokeneaService.getRandomPokenea();

  res.render('pokenea', {
    nombre: pokenea.nombre,
    frase: pokenea.frase,
    imagenUrl: pokeneaService.getImageUrl(pokenea),
    contenedorId: pokeneaService.getContainerId(),
  });
}

module.exports = { showJson, showPage };
