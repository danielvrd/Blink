/**
 * Criptografia dos arquivos com cadeado do Fast Note.
 *
 * Um arquivo privado e um .md que, por inteiro, vira:
 *
 *     BLINK-PRIVADO 1
 *     {"kdf":{"nome":"scrypt","salt":"...","N":32768,"r":8,"p":1},"iv":"...","tag":"...","dados":"..."}
 *
 * Nada do conteudo fica em claro no arquivo: so o cabecalho (que diz o que ele e) e os
 * parametros para derivar a chave. A senha vira uma chave de 256 bits com scrypt
 * (N=2^15, r=8, p=1, sal aleatorio de 16 bytes) e o conteudo e cifrado com AES-256-GCM
 * (iv de 12 bytes sorteado a cada gravacao; o tag de 16 bytes prova que nada foi
 * mexido; o cabecalho entra como "dado adicional autenticado", entao trocar o
 * cabecalho tambem reprova). Senha errada e arquivo adulterado dao o mesmo erro - e
 * nao ha como distinguir nem como recuperar sem a senha.
 *
 * O conteudo cifrado e um objeto: { v: 1, cabecalho: [], rodape: [], topicos: [...] },
 * onde cada topico e { tipo: 'texto', texto } ou { tipo: 'credencial', titulo, login, senha }.
 *
 * Este modulo so faz criptografia: nao le nem escreve arquivo e nao guarda nada. A chave
 * derivada (Buffer) fica com quem abriu o arquivo (notas-privadas.js), enquanto ele estiver
 * aberto; gravar de novo com a MESMA chave so sorteia outro iv, sem repetir o scrypt.
 *
 * Puro: sem Electron.
 */

const crypto = require('crypto');

const CABECALHO = 'BLINK-PRIVADO 1';

/** Parametros do scrypt de um arquivo novo. 32 MiB de memoria, ~100 ms. */
const KDF_PADRAO = { nome: 'scrypt', N: 32768, r: 8, p: 1 };
const TAMANHO_SAL = 16;
const TAMANHO_IV = 12;
const TAMANHO_CHAVE = 32;

/** O scrypt com N=2^15 e r=8 usa 32 MiB; o limite padrao do Node e exatamente esse, entao sobe-se com folga. */
const MEMORIA_MAXIMA = 128 * 1024 * 1024;

/** O erro de senha errada ou arquivo adulterado: o mesmo para os dois, de proposito. */
class SenhaIncorretaOuAdulterado extends Error {
  constructor() {
    super('Senha incorreta ou arquivo adulterado');
    this.name = 'SenhaIncorretaOuAdulterado';
  }
}

/** O arquivo nao e (mais) um arquivo privado valido: cabecalho ou JSON estragado. */
class FormatoInvalido extends Error {
  constructor(motivo) {
    super(`Arquivo privado invalido: ${motivo}`);
    this.name = 'FormatoInvalido';
  }
}

/** O texto de um arquivo comeca como um arquivo privado? */
function ehPrivado(conteudo) {
  return typeof conteudo === 'string' && (conteudo === CABECALHO || conteudo.startsWith(CABECALHO + '\n') || conteudo.startsWith(CABECALHO + '\r\n'));
}

/** Gera um sal novo (o que fica no arquivo para derivar a chave de novo). */
function novoSal() {
  return crypto.randomBytes(TAMANHO_SAL);
}

/**
 * Deriva a chave de uma senha. NFC: a mesma senha digitada com o acento "composto" ou "separado"
 * (teclados e programas diferentes) tem que dar a mesma chave.
 */
function derivarChave(senha, sal, kdf = KDF_PADRAO) {
  return new Promise((resolve, reject) => {
    if (typeof senha !== 'string' || senha === '') {
      reject(new Error('Senha vazia'));
      return;
    }
    crypto.scrypt(senha.normalize('NFC'), sal, TAMANHO_CHAVE, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: MEMORIA_MAXIMA }, (erro, chave) => {
      if (erro) reject(erro);
      else resolve(chave);
    });
  });
}

/**
 * Cifra um objeto com uma chave ja derivada.
 * `kdf` ({ salt, N, r, p }) so e gravado no arquivo, para a proxima abertura derivar a mesma chave.
 * Devolve o texto do arquivo inteiro.
 */
function cifrarComChave(objeto, chave, kdf) {
  const iv = crypto.randomBytes(TAMANHO_IV);
  const cifra = crypto.createCipheriv('aes-256-gcm', chave, iv, { authTagLength: 16 });
  cifra.setAAD(Buffer.from(CABECALHO, 'utf8'));
  const dados = Buffer.concat([cifra.update(JSON.stringify(objeto), 'utf8'), cifra.final()]);

  const corpo = {
    kdf: { nome: 'scrypt', salt: kdf.salt.toString('base64'), N: kdf.N, r: kdf.r, p: kdf.p },
    iv: iv.toString('base64'),
    tag: cifra.getAuthTag().toString('base64'),
    dados: dados.toString('base64'),
  };
  return `${CABECALHO}\n${JSON.stringify(corpo)}\n`;
}

/** Cifra um objeto com uma senha nova (sal novo). Devolve { texto, chave, kdf } - a chave para seguir gravando. */
async function cifrar(objeto, senha) {
  const sal = novoSal();
  const chave = await derivarChave(senha, sal);
  const kdf = { salt: sal, N: KDF_PADRAO.N, r: KDF_PADRAO.r, p: KDF_PADRAO.p };
  return { texto: cifrarComChave(objeto, chave, kdf), chave, kdf };
}

/** Le o JSON do arquivo e confere a forma. Lanca FormatoInvalido. */
function lerCorpo(texto) {
  if (!ehPrivado(texto)) throw new FormatoInvalido('cabecalho');
  const json = texto.slice(CABECALHO.length).trim();

  let corpo;
  try {
    corpo = JSON.parse(json);
  } catch (erro) {
    throw new FormatoInvalido('json');
  }

  const base64 = (v) => typeof v === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(v);
  const kdf = corpo && corpo.kdf;
  const ok = kdf && kdf.nome === 'scrypt' && base64(kdf.salt) && base64(corpo.iv) && base64(corpo.tag) && base64(corpo.dados)
    && Number.isInteger(kdf.N) && Number.isInteger(kdf.r) && Number.isInteger(kdf.p);
  if (!ok) throw new FormatoInvalido('campos');

  // Parametros fora do razoavel: um arquivo malicioso poderia pedir gigabytes ao scrypt.
  const potenciaDeDois = (n) => n >= 2 && (n & (n - 1)) === 0;
  if (!potenciaDeDois(kdf.N) || kdf.N > 2 ** 20 || kdf.r < 1 || kdf.r > 32 || kdf.p < 1 || kdf.p > 16 || 128 * kdf.N * kdf.r > MEMORIA_MAXIMA) {
    throw new FormatoInvalido('parametros do scrypt');
  }

  const iv = Buffer.from(corpo.iv, 'base64');
  const tag = Buffer.from(corpo.tag, 'base64');
  if (iv.length !== TAMANHO_IV || tag.length !== 16) throw new FormatoInvalido('tamanhos');

  return { kdf: { salt: Buffer.from(kdf.salt, 'base64'), N: kdf.N, r: kdf.r, p: kdf.p }, iv, tag, dados: Buffer.from(corpo.dados, 'base64') };
}

/** Decifra com uma chave ja derivada. Lanca SenhaIncorretaOuAdulterado. Devolve o objeto. */
function decifrarComChave(texto, chave) {
  const { iv, tag, dados } = lerCorpo(texto);
  try {
    const decifra = crypto.createDecipheriv('aes-256-gcm', chave, iv, { authTagLength: 16 });
    decifra.setAAD(Buffer.from(CABECALHO, 'utf8'));
    decifra.setAuthTag(tag);
    const claro = Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
    return JSON.parse(claro);
  } catch (erro) {
    throw new SenhaIncorretaOuAdulterado();
  }
}

/**
 * Abre um arquivo com a senha. Devolve { objeto, chave, kdf }: o conteudo e a chave (para o
 * arquivo ficar aberto e ser regravado sem repetir o scrypt).
 */
async function decifrar(texto, senha) {
  const { kdf } = lerCorpo(texto);
  const chave = await derivarChave(senha, kdf.salt, kdf);
  return { objeto: decifrarComChave(texto, chave), chave, kdf };
}

/** Duas chaves sao a mesma? (comparacao em tempo constante) */
function mesmaChave(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  CABECALHO,
  KDF_PADRAO,
  SenhaIncorretaOuAdulterado,
  FormatoInvalido,
  ehPrivado,
  derivarChave,
  cifrar,
  cifrarComChave,
  decifrar,
  decifrarComChave,
  lerCorpo,
  mesmaChave,
};
