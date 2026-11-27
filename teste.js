// teste.js: confere as contas do Radiola. Rode com:  node teste.js
const assert = require('assert');
const N = require('./nucleo.js');

let ok = 0;
function teste(nome, fn) { fn(); ok++; console.log('✓ ' + nome); }

teste('nome do arquivo vira artista e título', () => {
  assert.deepStrictEqual(N.lerNome('03 - Legião Urbana - Tempo Perdido.mp3'), { artista: 'Legião Urbana', titulo: 'Tempo Perdido' });
  assert.deepStrictEqual(N.lerNome('Queen_-_Bohemian_Rhapsody.m4a'), { artista: 'Queen', titulo: 'Bohemian Rhapsody' });
  assert.deepStrictEqual(N.lerNome('minha musica.ogg'), { artista: '', titulo: 'minha musica' });
  assert.deepStrictEqual(N.lerNome('A-ha - Take On Me - Remaster.mp3'), { artista: 'A-ha', titulo: 'Take On Me - Remaster' });
});

teste('tempo em minutos e segundos', () => {
  assert.strictEqual(N.formatarTempo(0), '0:00');
  assert.strictEqual(N.formatarTempo(75.9), '1:15');
  assert.strictEqual(N.formatarTempo(3725), '1:02:05');
  assert.strictEqual(N.formatarTempo(NaN), '0:00');
});

teste('próxima: para no fim, ou volta ao começo com "repetir a fila"', () => {
  assert.strictEqual(N.avancar(0, 3, 'nao', false), 1);
  assert.strictEqual(N.avancar(2, 3, 'nao', false), -1);
  assert.strictEqual(N.avancar(2, 3, 'todas', false), 0);
  assert.strictEqual(N.avancar(1, 3, 'uma', false), 1);    // acabou sozinha: repete a mesma
  assert.strictEqual(N.avancar(1, 3, 'uma', true), 2);     // apertou "próxima": vai para a próxima
  assert.strictEqual(N.avancar(0, 0, 'todas', true), -1);
});

teste('anterior: no começo fica na primeira (ou vai para a última com "repetir a fila")', () => {
  assert.strictEqual(N.voltar(2, 3, 'nao'), 1);
  assert.strictEqual(N.voltar(0, 3, 'nao'), 0);
  assert.strictEqual(N.voltar(0, 3, 'todas'), 2);
});

teste('aleatório: todas as músicas, uma vez cada, com a atual em primeiro', () => {
  for (let vez = 0; vez < 50; vez++) {
    const o = N.embaralhar(10, 4);
    assert.strictEqual(o[0], 4);
    assert.deepStrictEqual([...o].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  assert.strictEqual(N.embaralhar(5, -1).length, 5);
});

teste('só aceita arquivos de música', () => {
  assert.ok(N.ehAudio('a.mp3', ''));
  assert.ok(N.ehAudio('x', 'audio/ogg'));
  assert.ok(!N.ehAudio('foto.jpg', 'image/jpeg'));
});

// Monta uma etiqueta ID3 de mentira, do jeito que um MP3 de verdade traz
function etiqueta(versao, quadros) {
  const corpo = Buffer.concat(quadros.map(([id, dados]) => {
    const cab = Buffer.alloc(10);
    cab.write(id, 0, 'latin1');
    const t = dados.length;
    if (versao === 4) cab.writeUInt32BE(((t & 0xfe00000) << 3) | ((t & 0x1fc000) << 2) | ((t & 0x3f80) << 1) | (t & 0x7f), 4);
    else cab.writeUInt32BE(t, 4);
    return Buffer.concat([cab, dados]);
  }));
  const enchimento = Buffer.alloc(20);           // MP3 de verdade costuma ter zeros sobrando
  const t = corpo.length + enchimento.length;
  const cab = Buffer.from([0x49, 0x44, 0x33, versao, 0, 0, (t >> 21) & 0x7f, (t >> 14) & 0x7f, (t >> 7) & 0x7f, t & 0x7f]);
  return new Uint8Array(Buffer.concat([cab, corpo, enchimento, Buffer.from('resto do mp3')]));
}

teste('etiqueta ID3 2.3: título em UTF-16, artista em latin1, capa', () => {
  const utf16 = s => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const b = etiqueta(3, [
    ['TIT2', utf16('Aquarela')],
    ['TPE1', Buffer.concat([Buffer.from([0]), Buffer.from('Toquinho', 'latin1')])],
    ['APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0', 'latin1'), Buffer.from([3]), Buffer.from('capa\0', 'latin1'), jpg])],
  ]);
  const t = N.lerID3(b);
  assert.strictEqual(t.titulo, 'Aquarela');
  assert.strictEqual(t.artista, 'Toquinho');
  assert.strictEqual(t.capa.tipo, 'image/jpeg');
  assert.deepStrictEqual(Buffer.from(t.capa.dados), jpg);
});

teste('etiqueta ID3 2.4: texto em UTF-8 com acento', () => {
  const utf8 = s => Buffer.concat([Buffer.from([3]), Buffer.from(s, 'utf8')]);
  const t = N.lerID3(etiqueta(4, [['TIT2', utf8('Garota de Ipanema')], ['TPE1', utf8('Tom Jobim')], ['TALB', utf8('Coração')]]));
  assert.deepStrictEqual([t.titulo, t.artista, t.album], ['Garota de Ipanema', 'Tom Jobim', 'Coração']);
});

teste('arquivo sem etiqueta não quebra', () => {
  assert.strictEqual(N.lerID3(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), null);
  assert.strictEqual(N.tamanhoID3(new Uint8Array(3)), 0);
});

const A = require('./audius.js');
teste('Audius: resposta da API vira música da fila (e só as que tocam)', () => {
  const resposta = [
    { id: 'YmJWK', title: ' Samba de Roda ', duration: 215, genre: 'Samba', permalink: '/ana/samba',
      user: { name: 'Ana' }, artwork: { '150x150': 'p.jpg', '480x480': 'g.jpg' }, is_streamable: true },
    { id: 'x1', title: 'Exclusiva', user: { name: 'B' }, is_streamable: false },
    { id: 'x2', title: 'Apagada', user: { name: 'C' }, is_delete: true },
    null,
  ];
  const l = A.tocaveis(resposta).map(A.paraMusica);
  assert.strictEqual(l.length, 1);
  const m = l[0];
  assert.strictEqual(m.id, 'au-YmJWK');
  assert.strictEqual(m.fonte, 'audius');
  assert.strictEqual(m.titulo, 'Samba de Roda');
  assert.strictEqual(m.artista, 'Ana');
  assert.strictEqual(m.duracao, 215);
  assert.strictEqual(m.capaUrl, 'g.jpg');
  assert.strictEqual(m.capaPequena, 'p.jpg');
  assert.strictEqual(m.link, 'https://audius.co/ana/samba');
  assert.ok(A.enderecoDoSom('YmJWK').startsWith('https://api.audius.co/v1/tracks/YmJWK/stream?app_name=radiola'));
});

const R = require('./radio.js');
teste('Rádio: só https, sem repetidas, nome e gêneros', () => {
  const lista = [
    { stationuuid: '1', name: 'Boa', url_resolved: 'https://radio.com/stream', favicon: 'https://radio.com/ico.png', tags: 'rock, pop, ', country: 'Brazil' },
    { stationuuid: '2', name: 'Ruim HTTP', url_resolved: 'http://radio.com/stream', favicon: 'https://radio.com/ico.png', tags: 'samba' },
    { stationuuid: '3', name: 'Repetida', url_resolved: 'https://radio.com/stream', favicon: 'https://radio.com/ico.png', tags: 'rock' },
    { name: 'Sem ID', url_resolved: 'https://radio.com/stream2', tags: 'jazz' },
    { stationuuid: '4', name: 'Favicon HTTP', url_resolved: 'https://radio.com/stream3', favicon: 'http://radio.com/ico.png', tags: 'notícias' }
  ];
  const t = R.tocaveis(lista);
  assert.strictEqual(t.length, 2);
  assert.strictEqual(t[0].nome, 'Boa');
  assert.strictEqual(t[0].capaUrl, 'https://radio.com/ico.png');
  assert.deepStrictEqual(t[0].generos, ['rock', 'pop']);
  assert.strictEqual(t[1].nome, 'Favicon HTTP');
  assert.strictEqual(t[1].capaUrl, null);
});

teste('Rádio: juntar a busca por nome e por estilo sem perder nada (e sem repetir)', () => {
  const porNome = R.tocaveis([{ stationuuid: 'a', name: 'Rádio Samba', url_resolved: 'https://x/a' }]);
  const porEstilo = R.tocaveis([
    { stationuuid: 'a', name: 'Rádio Samba', url_resolved: 'https://x/a' },
    { stationuuid: 'b', name: 'Pagode FM', url_resolved: 'https://x/b', tags: 'samba' },
  ]);
  const j = R.juntar(porNome, porEstilo);
  assert.deepStrictEqual(j.map(e => e.nome), ['Rádio Samba', 'Pagode FM']);
});

const C = require('./colecao.js');
teste('coleção: criar playlist (nome limpo, sem repetir)', () => {
  const pls = [];
  assert.strictEqual(C.criar(pls, '   '), null);
  const a = C.criar(pls, '  Treino   da  manhã ');
  assert.strictEqual(a.nome, 'Treino da manhã');
  assert.strictEqual(C.criar(pls, 'treino da MANHÃ').nome, 'treino da MANHÃ (2)');
  assert.strictEqual(C.criar(pls, 'x'.repeat(60)).nome.length, 40);
  assert.strictEqual(pls.length, 3);
  assert.notStrictEqual(pls[0].id, pls[1].id);
});

teste('coleção: pôr, tirar, curtir e apagar de todas as listas', () => {
  const lista = [];
  assert.ok(C.por(lista, 'a'));
  assert.ok(!C.por(lista, 'a'));           // não repete
  assert.ok(C.por(lista, 'b'));
  assert.ok(C.tirar(lista, 'a'));
  assert.deepStrictEqual(lista, ['b']);
  const curtidas = [];
  assert.strictEqual(C.alternar(curtidas, 'x'), true);
  assert.strictEqual(C.alternar(curtidas, 'x'), false);
  const pls = [{ id: 'p', nome: 'P', ids: ['x', 'y'] }];
  C.alternar(curtidas, 'x');
  C.esquecer('x', curtidas, pls);
  assert.deepStrictEqual(curtidas, []);
  assert.deepStrictEqual(pls[0].ids, ['y']);
  assert.strictEqual(C.contar(1), '1 música');
  assert.strictEqual(C.contar(0), '0 músicas');
});

teste('coleção: dado estragado não quebra', () => {
  assert.deepStrictEqual(C.arrumar(null), []);
  assert.deepStrictEqual(C.arrumar([null, { id: 1 }, { id: 'p', nome: '  ', ids: [] }]), []);
  assert.deepStrictEqual(C.arrumar([{ id: 'p', nome: 'Ok', ids: ['a', 3, null] }]), [{ id: 'p', nome: 'Ok', ids: ['a'], criado: 0 }]);
});

console.log(`\n${ok} testes passaram.`);
