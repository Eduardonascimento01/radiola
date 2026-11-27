// banco.js: guarda as suas músicas DENTRO do navegador (IndexedDB),
// para elas continuarem lá quando você fechar e abrir o Radiola de novo.
// O localStorage só aguenta uns 5 MB de texto; o IndexedDB guarda arquivos
// inteiros (blobs) e aguenta bem mais (o navegador dá uma parte do disco livre).
(function (raiz) {
  'use strict';

  const NOME = 'radiola', VERSAO = 1, MUSICAS = 'musicas';
  let aberto = null;

  function abrir() {
    if (aberto) return aberto;
    aberto = new Promise((ok, erro) => {
      const r = indexedDB.open(NOME, VERSAO);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(MUSICAS)) db.createObjectStore(MUSICAS, { keyPath: 'id' });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    return aberto;
  }

  // Faz uma operação e espera ela terminar
  async function pedir(modo, fazer) {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction(MUSICAS, modo);
      const r = fazer(t.objectStore(MUSICAS));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => erro(t.error);
      t.onabort = () => erro(t.error || new Error('cancelado'));
    });
  }

  const listar = () => pedir('readonly', s => s.getAll());
  const salvar = musica => pedir('readwrite', s => s.put(musica));
  const apagar = id => pedir('readwrite', s => s.delete(id));

  // Pede ao navegador para não apagar as músicas quando o disco estiver cheio
  async function pedirParaGuardar() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { }
    return false;
  }

  raiz.Banco = { listar, salvar, apagar, pedirParaGuardar };
})(this);
