// Primeira publicação do Cotador 3D na Cloudflare (Worker + D1).
// Executa: npm install → login → cria/encontra o D1 → tabela + dados iniciais → deploy.
// Tudo é registrado em setup-log.txt nesta pasta.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, "setup-log.txt");
writeFileSync(LOG, `Cotador 3D - setup ${new Date().toISOString()}\n`);
const log = (s) => { console.log(s); appendFileSync(LOG, s + "\n"); };

function run(cmd, { inherit = false, allowFail = false } = {}) {
  log(`\n> ${cmd}`);
  try {
    if (inherit) { execSync(cmd, { cwd: DIR, stdio: "inherit" }); return ""; }
    const out = execSync(cmd, { cwd: DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    log(out.trim());
    return out;
  } catch (e) {
    const msg = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
    log(msg);
    if (!allowFail) { log("\nERRO: etapa falhou. Veja as mensagens acima."); process.exit(1); }
    return msg;
  }
}

const parseJson = (s) => { const i = s.search(/[\[{]/); return JSON.parse(s.slice(i)); };

// Primeira vez: cria o wrangler.jsonc (fica só neste computador) a partir do modelo.
const cfgPath = join(DIR, "wrangler.jsonc");
if (!existsSync(cfgPath)) {
  copyFileSync(join(DIR, "wrangler.example.jsonc"), cfgPath);
  log("Criei wrangler.jsonc a partir de wrangler.example.jsonc.");
}

log("1/6 Instalando dependências (wrangler)...");
run("npm install --no-audit --no-fund");

log("\n2/6 Verificando login na Cloudflare...");
const who = run("npx wrangler whoami", { allowFail: true });
if (!/logged in with an? (OAuth|API) Token|associated with the email/i.test(who) || /not logged in|not authenticated|expired/i.test(who)) {
  log("Abrindo o navegador para autorizar a Cloudflare. Clique em 'Allow' e volte para esta janela.");
  run("npx wrangler login", { inherit: true });
  run("npx wrangler whoami");
}

log("\n3/6 Banco D1 'cotador'...");
let dbs = parseJson(run("npx wrangler d1 list --json"));
let db = dbs.find((d) => d.name === "cotador");
let novo = false;
if (!db) {
  run("npx wrangler d1 create cotador");
  dbs = parseJson(run("npx wrangler d1 list --json"));
  db = dbs.find((d) => d.name === "cotador");
  novo = true;
}
if (!db) { log("ERRO: não encontrei o banco 'cotador' após criar."); process.exit(1); }
const id = db.uuid || db.database_id || db.id;
log(`database_id = ${id}`);
const cfg = readFileSync(cfgPath, "utf8");
writeFileSync(cfgPath, cfg.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${id}"`));

log("\n4/6 Criando a tabela...");
run("npx wrangler d1 execute cotador --remote --yes --file=schema.sql");

log("\n5/6 Dados iniciais...");
const cnt = run('npx wrangler d1 execute cotador --remote --yes --json --command "SELECT count(*) AS n FROM docs"', { allowFail: true });
let n = 0; try { n = parseJson(cnt)[0].results[0].n; } catch {}
const seed = existsSync(join(DIR, "seed.local.sql")) ? "seed.local.sql" : "seed.sql";
if (novo || n === 0) run(`npx wrangler d1 execute cotador --remote --yes --file=${seed}`);
else log(`Banco já tem ${n} registros; dados iniciais não foram recarregados.`);

log("\n6/6 Publicando...");
const dep = run("npx wrangler deploy");
const url = (dep.match(/https:\/\/\S+\.workers\.dev/) || [])[0];
log(`\nPRONTO${url ? ": " + url : ""}`);
log("IMPORTANTE: proteja o endereço com login (Cloudflare Access). Veja o README.");
if (url) { try { execSync(`start ${url}`, { shell: true }); } catch {} }
