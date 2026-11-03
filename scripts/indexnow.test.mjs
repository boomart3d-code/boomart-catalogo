import test from 'node:test';
import assert from 'node:assert/strict';
import { sitemapUrls, changedUrls, submit, SITE } from './indexnow.mjs';
test('solo destinos canonicos del sitemap, sin feeds, privadas ni duplicados', () => {
  const urls = sitemapUrls(`<loc>${SITE}/</loc><loc>${SITE}/producto/a/</loc><loc>${SITE}/categoria/macetas/</loc><loc>https://ajeno.test/</loc><loc>${SITE}/?categoria=a</loc>`);
  assert.deepEqual(changedUrls(['index.html', 'producto/a/index.html', 'producto/a/index.html', 'categoria/macetas/index.html', 'admin/index.html', 'feed-google.xml', 'src/app.js'], urls), [SITE + '/', SITE + '/producto/a/', SITE + '/categoria/macetas/']);
});
test('un fallo HTTP no puede pasar como entrega correcta', async () => {
  await assert.rejects(submit([SITE + '/'], async () => ({status:403,text:async ()=>'invalid key'})), /HTTP 403/);
});
test('202 es recibido pendiente, no indexado, y no envía lotes vacíos', async () => {
  let body;
  const result = await submit([SITE + '/producto/a/'], async (_url, options) => { body = JSON.parse(options.body); return {status:202}; });
  assert.equal(body.urlList[0], SITE + '/producto/a/');
  assert.equal(result.status, 202);
  assert.match(result.meaning, /no necesariamente/);
  assert.equal((await submit([], () => { throw new Error('no debe invocarse'); })).submitted, 0);
});
