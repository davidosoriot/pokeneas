const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

process.env.IMAGES_BASE_URL = 'https://bucket-prueba.s3.us-east-1.amazonaws.com/';

const app = require('../src/app');
const pokeneas = require('../src/data/pokeneas');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('hay entre 7 y 10 pokeneas con todos sus campos', () => {
  assert.ok(pokeneas.length >= 7 && pokeneas.length <= 10);
  for (const pokenea of pokeneas) {
    for (const campo of ['id', 'nombre', 'altura', 'habilidad', 'imagen', 'frase']) {
      assert.ok(pokenea[campo], `${pokenea.nombre} no tiene ${campo}`);
    }
  }
});

test('GET /api/pokenea devuelve solo los campos pedidos y el id del contenedor', async () => {
  const res = await fetch(`${baseUrl}/api/pokenea`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['altura', 'contenedorId', 'habilidad', 'id', 'nombre']);
  assert.equal(body.contenedorId, os.hostname());
});

test('GET /pokenea muestra imagen del bucket, frase e id del contenedor', async () => {
  const res = await fetch(`${baseUrl}/pokenea`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(html, /src="https:\/\/bucket-prueba\.s3\.us-east-1\.amazonaws\.com\/[a-z]+\.png"/);
  assert.ok(html.includes(os.hostname()));
  assert.ok(pokeneas.some(({ imagen }) => html.includes(imagen)));
});

test('las respuestas cierran la conexión para que Swarm reparta entre contenedores', async () => {
  const res = await fetch(`${baseUrl}/api/pokenea`);

  assert.equal(res.headers.get('connection'), 'close');
});

test('GET / redirige a /pokenea', async () => {
  const res = await fetch(baseUrl, { redirect: 'manual' });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/pokenea');
});
