/**
 * Gera o src/assets/icones/blink.ico a partir dos SVGs do olho.
 *
 * Rode com:  npm run gerar-icone
 *
 * O .ico fica versionado no repositorio, entao este script so precisa rodar
 * quando o desenho do olho mudar. Ele nao roda junto com o app.
 *
 * Um .ico guarda varias imagens de tamanhos diferentes no mesmo arquivo e o
 * Windows escolhe a que precisa. Aqui usamos dois desenhos: o detalhado nos
 * tamanhos grandes e o simplificado nos pequenos, onde os tracos finos somem.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngParaIco = require('png-to-ico');

const PASTA_ASSETS = path.join(__dirname, '..', 'src', 'assets');
const SAIDA = path.join(PASTA_ASSETS, 'icones', 'blink.ico');

// Qual SVG usar em cada tamanho.
const TAMANHOS = [
  { px: 16, svg: 'olho-simples.svg' },
  { px: 20, svg: 'olho-simples.svg' },
  { px: 24, svg: 'olho-simples.svg' },
  { px: 32, svg: 'olho-simples.svg' }, // 32 e o tamanho da bandeja a 200% de escala
  { px: 48, svg: 'olho.svg' },
  { px: 256, svg: 'olho.svg' }, // usado pelo Windows em telas grandes e no instalador
];

async function gerar() {
  const pngs = [];

  for (const { px, svg } of TAMANHOS) {
    const caminhoSvg = path.join(PASTA_ASSETS, svg);
    const png = await sharp(caminhoSvg)
      .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    pngs.push(png);
    console.log(`  ${String(px).padStart(3)}px  <- ${svg}`);
  }

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, await pngParaIco(pngs));

  const kb = (fs.statSync(SAIDA).size / 1024).toFixed(1);
  console.log(`\nGerado: ${SAIDA} (${kb} KB)`);
}

gerar().catch((erro) => {
  console.error('Falhou ao gerar o icone:', erro);
  process.exit(1);
});
