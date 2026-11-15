#!/usr/bin/env node
// Generate or edit images with the OpenAI Images API. No dependencies; needs Node 18.3+.
// Usage: node index.js [options] "prompt"        (node index.js --help for all options)
// Saved file paths go to stdout, one per line. Progress, cost and errors go to stderr.

const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const API = 'https://api.openai.com/v1/images';
const DEFAULT_MODEL = 'gpt-image-2.5-sunburst';
const ENV_FILE = path.join(__dirname, '.env');
loadEnvFile();
// USD per 1M tokens, from developers.openai.com/api/docs/pricing (checked 2026-11-02).
const PRICES = { 'gpt-image-2.5-sunburst': { textIn: 5, imageIn: 8, imageOut: 30 } };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const FORMATS = ['png', 'jpeg', 'webp'];

const HELP = `Generate an image from a prompt, or edit/combine images when -i is given.

Usage: node index.js [options] "prompt"
       node index.js [options] -f prompt.txt
       echo "prompt" | node index.js [options] -

Options:
  -i, --image FILE        input image (PNG, JPEG, WebP); repeat for several. Switches to edit mode:
                          the result is based on these images, in the order given.
  -f, --prompt-file FILE  read the prompt from a file
  -p, --project NAME      save into a subfolder named after the project (e.g. es-sebelas)
  -o, --out DIR           exact output folder; overrides the default and --project
                          (default: $OPENAI_IMG_GEN_OUT, else the current folder; plus /NAME with -p)
      --name PREFIX       file name prefix (default: image)
  -s, --size SIZE         auto | 1024x1024 | 1536x1024 | 1024x1536 (default: auto)
  -q, --quality Q         auto | low | medium | high (default: auto)
  -n COUNT                number of images, 1-10 (default: 1)
      --format F          png | jpeg | webp (default: png)
      --background B      auto | transparent | opaque (transparent needs png or webp)
      --model M           default: $OPENAI_IMAGE_MODEL or ${DEFAULT_MODEL}
  -h, --help

API key: $OPENAI_API_KEY, or OPENAI_API_KEY=... in ${ENV_FILE} (copy .env.example).`;

class UserError extends Error {}

// Loads KEY=VALUE lines from the .env next to this script. Real environment variables win.
function loadEnvFile() {
  let text;
  try {
    text = readFileSync(ENV_FILE, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

let opt, positionals;
try {
  ({ values: opt, positionals } = parseArgs({ allowPositionals: true, options: optionSpec() }));
} catch (err) {
  console.error(`${err.message}\nRun with --help for usage.`);
  process.exit(1);
}

function optionSpec() {
  return {
    image: { type: 'string', short: 'i', multiple: true, default: [] },
    'prompt-file': { type: 'string', short: 'f' },
    out: { type: 'string', short: 'o' },
    project: { type: 'string', short: 'p' },
    name: { type: 'string', default: 'image' },
    size: { type: 'string', short: 's', default: 'auto' },
    quality: { type: 'string', short: 'q', default: 'auto' },
    n: { type: 'string', short: 'n', default: '1' },
    format: { type: 'string', default: 'png' },
    background: { type: 'string' },
    model: { type: 'string', default: process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL },
    help: { type: 'boolean', short: 'h' },
  };
}

// -o wins. Otherwise $OPENAI_IMG_GEN_OUT (or the current folder), plus a project subfolder when -p is given.
function outputDir() {
  if (opt.out) return path.resolve(opt.out);
  const base = path.resolve(process.env.OPENAI_IMG_GEN_OUT || '.');
  if (!opt.project) return base;
  const slug = opt.project.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!slug) throw new UserError(`--project "${opt.project}" has no usable characters for a folder name.`);
  return path.join(base, slug);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readPrompt() {
  if (opt['prompt-file']) {
    if (positionals.length) throw new UserError('Give the prompt as text or with -f, not both.');
    return fs.readFile(opt['prompt-file'], 'utf8').catch(() => {
      throw new UserError(`Cannot read prompt file: ${opt['prompt-file']}`);
    });
  }
  if (positionals.length === 1 && positionals[0] === '-') return readStdin();
  return positionals.join(' ');
}

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new UserError(`No API key. Set OPENAI_API_KEY, or copy .env.example to ${ENV_FILE} and fill it in.`);
}

// Reads the -i files up front, so a bad path or type fails before any API call.
async function readImages() {
  return Promise.all(
    opt.image.map(async (file) => {
      const type = MIME[path.extname(file).toLowerCase()];
      if (!type) throw new UserError(`${file}: only PNG, JPEG and WebP images are supported.`);
      const data = await fs.readFile(file).catch(() => {
        throw new UserError(`Cannot read image: ${file}`);
      });
      return { name: path.basename(file), blob: new Blob([data], { type }) };
    }),
  );
}

async function request(key, params, images) {
  const headers = { Authorization: `Bearer ${key}` };
  if (!images.length) {
    return fetch(`${API}/generations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  const field = images.length > 1 ? 'image[]' : 'image';
  for (const img of images) form.append(field, img.blob, img.name);
  return fetch(`${API}/edits`, { method: 'POST', headers, body: form });
}

function apiError(res, body) {
  const e = body?.error ?? {};
  const id = res.headers.get('x-request-id');
  let msg = `OpenAI API error ${res.status}${e.code ? ` (${e.code})` : ''}: ${e.message ?? res.statusText}`;
  if (e.code === 'moderation_blocked') {
    msg += '\nThe request was blocked by a safety check. Reword the prompt or change the input images and try again.';
  }
  return new UserError(id ? `${msg}\nRequest id: ${id}` : msg);
}

function logCost(usage) {
  if (!usage) return;
  const textIn = usage.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  const imageOut = usage.output_tokens ?? 0;
  const price = PRICES[opt.model];
  const cost = price
    ? ` Cost: about $${((textIn * price.textIn + imageIn * price.imageIn + imageOut * price.imageOut) / 1e6).toFixed(3)}`
    : '';
  console.error(`Tokens: ${textIn} text in, ${imageIn} image in, ${imageOut} image out.${cost}`);
}

async function main() {
  if (opt.help) return console.log(HELP);
  const prompt = (await readPrompt()).trim();
  if (!prompt) throw new UserError('No prompt. Run with --help for usage.');
  const n = Number(opt.n);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new UserError('-n must be a whole number from 1 to 10.');
  if (!FORMATS.includes(opt.format)) throw new UserError(`--format must be one of: ${FORMATS.join(', ')}.`);

  const params = { model: opt.model, prompt, n, size: opt.size, quality: opt.quality, output_format: opt.format };
  if (opt.background) params.background = opt.background;

  const images = await readImages();
  const outDir = outputDir();
  await fs.mkdir(outDir, { recursive: true }); // before the API call, so a bad folder costs nothing
  const key = apiKey();
  const mode = images.length ? `editing ${images.length} image(s)` : 'generating';
  console.error(`${opt.model}: ${mode}, ${n} x ${opt.size}, quality ${opt.quality}...`);
  const res = await request(key, params, images);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw apiError(res, body);
  if (!body?.data?.length) throw new UserError('The API returned no images.');

  const base = `${opt.name}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const ext = opt.format === 'jpeg' ? 'jpg' : opt.format;
  // The prompt and inputs are saved beside the images, so any result can be reproduced.
  const inputs = opt.image.length ? `Input images, in order:\n${opt.image.map((f) => `- ${path.resolve(f)}`).join('\n')}\n\n` : '';
  await fs.writeFile(path.join(outDir, `${base}.prompt.txt`), `${inputs}${prompt}\n`);
  for (const [i, img] of body.data.entries()) {
    if (!img.b64_json) throw new UserError('The API returned an image without data.');
    const file = path.join(outDir, `${base}${body.data.length > 1 ? `-${i + 1}` : ''}.${ext}`);
    await fs.writeFile(file, Buffer.from(img.b64_json, 'base64'));
    console.log(file);
  }
  logCost(body.usage);
}

main().catch((err) => {
  console.error(err instanceof UserError ? err.message : err);
  process.exitCode = 1;
});
