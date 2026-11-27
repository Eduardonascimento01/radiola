// extras.js: funções extras para o Radiola (etapa 7: timer, cores pela capa, atalhos).
(function (raiz) {
  'use strict';

  // Cor predominante de um array de pixels RGBA (ex: 24x24).
  // NÃO dá para fazer a média de tudo: capa com azul e laranja vira cinza (como misturar tinta).
  // Por isso separamos as cores em 12 "famílias" pelo tom (a roda de cores: vermelho, laranja,
  // amarelo...), cada pixel vale mais quanto mais forte (saturada) for a cor dele, e ficamos com
  // a família mais forte. A cor final é a média só dessa família.
  function corDaCapa(pixels) {
    if (!pixels || !pixels.length) return null;
    const familias = Array.from({ length: 12 }, () => ({ peso: 0, r: 0, g: 0, b: 0, n: 0 }));
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3] !== undefined ? pixels[i + 3] : 255;

      // ignora pixels quase transparentes
      if (a < 128) continue;
      // ignora quase pretos (soma < 60)
      if ((r + g + b) < 60) continue;
      // ignora quase brancos (todos > 235)
      if (r > 235 && g > 235 && b > 235) continue;
      // ignora cinzentos (diferença entre o maior e o menor canal < 25)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if ((max - min) < 25) continue;

      // tom (0 a 360 graus na roda de cores) e força da cor (saturação, 0 a 1)
      const d = max - min;
      let tom;
      if (max === r) tom = ((g - b) / d) % 6;
      else if (max === g) tom = (b - r) / d + 2;
      else tom = (r - g) / d + 4;
      tom = (tom * 60 + 360) % 360;
      const forca = d / max;
      if (forca < 0.3) continue;   // cor apagada demais (marrom acinzentado, bege): não serve de destaque
      const f = familias[Math.floor(tom / 30) % 12];
      // força ao quadrado: cor viva vale MUITO mais que cor apagada (a arara azul ganha do fundo marrom).
      // A média da família também é "puxada" pelas cores vivas (média com peso).
      const p = forca * forca;
      f.peso += p;
      f.r += r * p; f.g += g * p; f.b += b * p; f.n++;
      count++;
    }
    if (count === 0) return null;
    const melhor = familias.reduce((a, b) => (b.peso > a.peso ? b : a));
    return {
      r: Math.round(melhor.r / melhor.peso),
      g: Math.round(melhor.g / melhor.peso),
      b: Math.round(melhor.b / melhor.peso)
    };
  }

  // Calcula a luminância de uma cor RGB (fórmula padrão WCAG)
  function luminancia({ r, g, b }) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  // Ajusta o contraste da cor conforme o tema (escuro ou claro) para garantir legibilidade
  function ajustarContraste(cor, escuro) {
    if (!cor) return { r: 245, g: 158, b: 11 };
    let { r, g, b } = cor;
    let lum = luminancia({ r, g, b });
    if (escuro) {
      // clarear até a luminância ficar >= 0.45
      while (lum < 0.45 && (r < 255 || g < 255 || b < 255)) {
        r = Math.min(255, Math.round(r + (255 - r) * 0.15 + 1));
        g = Math.min(255, Math.round(g + (255 - g) * 0.15 + 1));
        b = Math.min(255, Math.round(b + (255 - b) * 0.15 + 1));
        lum = luminancia({ r, g, b });
      }
    } else {
      // escurecer até a luminância ficar <= 0.45
      while (lum > 0.45 && (r > 0 || g > 0 || b > 0)) {
        r = Math.max(0, Math.round(r * 0.85));
        g = Math.max(0, Math.round(g * 0.85));
        b = Math.max(0, Math.round(b * 0.85));
        lum = luminancia({ r, g, b });
      }
    }
    return { r, g, b };
  }

  // Formata segundos em "12:30" ou "1:00:00"
  function formatarTimer(seg) {
    if (!isFinite(seg) || seg < 0) seg = 0;
    seg = Math.floor(seg);
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  const api = {
    corDaCapa,
    luminancia,
    ajustarContraste,
    formatarTimer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Extras = api;
})(typeof window !== 'undefined' ? window : global);
