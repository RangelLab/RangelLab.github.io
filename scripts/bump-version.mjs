import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  pkg: resolve(root, "package.json"),
  history: resolve(root, "version-history.json"),
  markdown: resolve(root, "VERSION_HISTORY.md"),
};
// Os históricos são artefatos gerados pelo próprio script e não devem disparar outra versão.
const VERSION_ARTIFACTS = new Set([
  "version-history.json",
  "VERSION_HISTORY.md",
  "public/version-history.json",
]);
const isVersionedFile = (file) => !VERSION_ARTIFACTS.has(file);
const SKIP_MARKERS = /\[(skip ci|sem-versao|auto-versao)\]/i;
const MIN_LEN = 12;
const PLACEHOLDERS = [
  /atualizações, melhorias e correções desta versão/i,
  /revisão incrementada para registrar/i,
  /ajustes e correções registrados/i,
  /revisão incrementada para registrar/i,
];
const RANK = { patch: 0, minor: 1, major: 2 };
const USAGE = `Uso:
  node scripts/bump-version.mjs <patch|minor|major> "O que mudou" ["Outra mudança" ...] [--title "Título"] [--dry-run]
  node scripts/bump-version.mjs auto --before <sha> [--after <sha>] [--message "mensagem do commit"] [--dry-run]
  node scripts/bump-version.mjs check
  node scripts/bump-version.mjs regenerate`;

const fail = (msg) => { console.error("Erro: " + msg); process.exit(1); };
const skip = (reason) => { console.log("Nenhuma versão gerada: " + reason); process.exit(0); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? ""));
  return match ? match.slice(1).map(Number) : null;
};
const isGeneric = (text) => PLACEHOLDERS.some((re) => re.test(text));
const capitalize = (value) => value ? value[0].toLocaleUpperCase("pt-BR") + value.slice(1) : value;
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const validSha = (sha) => Boolean(sha) && !/^0+$/.test(sha);


function compareDesc(a, b) {
  const av = parseVersion(a.version), bv = parseVersion(b.version);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return bv[i] - av[i];
  return 0;
}
function validate(history, pkg) {
  const errors = [];
  if (!Array.isArray(history) || history.length === 0) errors.push("version-history.json deve conter pelo menos uma versão.");
  if ("revision" in pkg) errors.push('package.json ainda contém o campo "revision".');
  if (!parseVersion(pkg.version)) errors.push("package.json contém uma versão semântica inválida.");
  if (!Array.isArray(history)) return errors;
  const seen = new Set();
  history.forEach((entry, index) => {
    const label = `entrada ${index + 1}`;
    if (!parseVersion(entry.version)) errors.push(`${label}: versão inválida (${entry.version}).`);
    if ("revision" in entry) errors.push(`v${entry.version}: o campo "revision" não é mais usado.`);
    if (!Array.isArray(entry.changes) || entry.changes.length === 0) errors.push(`v${entry.version}: falta a lista de alterações.`);
    else if (entry.changes.some((change) => typeof change !== "string" || !change.trim())) errors.push(`v${entry.version}: há uma alteração vazia ou inválida.`);
    if (seen.has(entry.version)) errors.push(`v${entry.version} aparece mais de uma vez no histórico.`);
    seen.add(entry.version);
  });
  for (let i = 0; i < history.length - 1; i++) {
    if (parseVersion(history[i].version) && parseVersion(history[i + 1].version) && compareDesc(history[i], history[i + 1]) >= 0) {
      errors.push("O histórico não está em ordem semântica decrescente.");
    }
  }
  if (history[0]?.version !== pkg.version) errors.push(`package.json (v${pkg.version}) diverge do histórico (v${history[0]?.version}).`);
  return errors;
}
function renderMarkdown(history) {
  const lines = [
    "# Histórico de versões do JSLynk", "",
    "Este arquivo registra as versões publicadas do JSLynk. A versão do JSLynk é independente da versão dos aplicativos conectados.", ""
  ];
  for (const entry of history) {
    lines.push(`## v${entry.version} (${entry.date})`, "");
    if (entry.title && entry.title !== entry.changes[0].slice(0, 80)) lines.push(`**${entry.title}**`, "");
    for (const change of entry.changes) lines.push(`- ${change}`);
    lines.push("");
  }
  lines.push("## Regras de versionamento", "",
    "- Correção ou ajuste: incrementa PATCH.",
    "- Nova funcionalidade: incrementa MINOR.",
    "- Mudança incompatível: incrementa MAJOR.",
    "- Se houver mais de um tipo de alteração, prevalece o incremento de maior impacto.", "");
  return lines.join("\n");
}
function save(history, pkg) {
  delete pkg.revision;
  for (const entry of history) delete entry.revision;
  writeFileSync(paths.history, JSON.stringify(history, null, 2) + "\n");
  writeFileSync(paths.pkg, JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync(paths.markdown, renderMarkdown(history));
}
function load() {
  const history = readJson(paths.history), pkg = readJson(paths.pkg);
  return { history, pkg, errors: validate(history, pkg) };
}
function nextVersion(current, kind) {
  let [major, minor, patch] = parseVersion(current);
  if (kind === "major") [major, minor, patch] = [major + 1, 0, 0];
  else if (kind === "minor") [minor, patch] = [minor + 1, 0];
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}
function parseArgs(args) {
  const out = { positionals: [], title: undefined, before: undefined, after: undefined, message: undefined, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--title") out.title = args[++i];
    else if (arg === "--before") out.before = args[++i];
    else if (arg === "--after") out.after = args[++i];
    else if (arg === "--message") out.message = args[++i];
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--")) fail(`opção desconhecida: ${arg}\n${USAGE}`);
    else out.positionals.push(arg.trim());
  }
  return out;
}
function classify(message, sha) {
  const [subjectRaw, ...rest] = message.trim().split(/\r?\n/);
  const subject = subjectRaw.trim();
  const m = /^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/.exec(subject);
  const type = m?.[1]?.toLowerCase();
  const breaking = Boolean(m?.[3]) || /^BREAKING[ -]CHANGE:/m.test(message);
  const kind = breaking ? "major" : type === "feat" ? "minor" : "patch";
  let description = capitalize((m ? m[4] : subject).trim());
  if (description.length < MIN_LEN || isGeneric(description)) {
    description = `Alterações no commit ${sha}: ${description || "sem descrição"}`;
  }
  return { kind, text: description };
}
function changedFiles(before, after) {
  if (!validSha(before)) return null;
  try { return git("diff", "--name-only", before, after).split("\n").filter(Boolean); }
  catch { return null; }
}
// Analisa commits em todo o repositório; só ignora os arquivos de histórico gerados.
function commitList(before, after) {
  if (!validSha(before)) return null;
  try {
    const output = git("log", "--no-merges", "--reverse", "--format=%H%x1f%B%x00", `${before}..${after}`);
    const commits = output.split("\0").map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
      const [sha, ...message] = chunk.split("\x1f");
      return { sha: sha.trim(), message: message.join("\x1f").trim() };
    });
    const eligible = commits.filter((commit) => {
      try {
        const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", commit.sha)
          .split("\n")
          .filter(Boolean);
        return files.some(isVersionedFile);
      } catch {
        return false;
      }
    });
    return eligible.length ? eligible : null;
  } catch { return null; }
}
function publish(kind, changes, title, dryRun) {
  const { history, pkg, errors } = load();
  if (errors.length) fail("O versionamento está inconsistente; corrija antes de continuar:\n- " + errors.join("\n- "));
  for (const change of changes) {
    if (change.length < MIN_LEN || isGeneric(change)) fail(`descrição de alteração genérica ou curta demais: "${change}"`);
  }
  const now = new Date();
  const entry = {
    version: nextVersion(pkg.version, kind),
    date: now.toISOString().slice(0, 10),
    timestamp: now.toISOString(),
    title: (title?.trim() || changes[0]).slice(0, 80),
    changes
  };
  if (dryRun) { console.log("Simulação; nenhum arquivo foi alterado:"); console.log(JSON.stringify(entry, null, 2)); return; }
  save([entry, ...history], { ...pkg, version: entry.version });
  console.log(`JSLynk atualizado para v${entry.version}`);
}

const args = process.argv.slice(2);
const mode = args.shift();
const opts = parseArgs(args);
if (mode === "check") {
  const { history, errors } = load();
  const generic = Array.isArray(history) ? history.filter((entry) => (entry.changes ?? []).some(isGeneric)).length : 0;
  if (generic) console.warn(`Aviso: ${generic} entrada(s) com descrição genérica.`);
  if (errors.length) fail("verificação falhou:\n- " + errors.join("\n- "));
  console.log("Versionamento consistente: MAJOR.MINOR.PATCH, sem REV.");
} else if (mode === "regenerate") {
  const { history, pkg, errors } = load();
  if (errors.length) fail("corrija antes de regenerar:\n- " + errors.join("\n- "));
  save(history, pkg);
  console.log("Histórico Markdown regenerado.");
} else if (mode === "auto") {
  const after = validSha(opts.after) ? opts.after : "HEAD";
  const files = changedFiles(opts.before, after);
  if (files && !files.some(isVersionedFile)) skip("nenhum arquivo alterado além dos históricos gerados automaticamente.");
  let headSha = "desconhecido";
  try { headSha = git("rev-parse", "--short", after).trim(); } catch {}
  const commits = commitList(opts.before, after) ?? (opts.message ? [{ sha: headSha, message: opts.message }] : []);
  const eligible = commits.filter((commit) => !SKIP_MARKERS.test(commit.message) && !/^Merge (branch|pull request|remote-tracking)/i.test(commit.message));
  if (!eligible.length) skip("nenhum commit elegível que altere arquivos do aplicativo.");
  const parsed = eligible.map((commit) => classify(commit.message, commit.sha));
  const kind = parsed.reduce((best, item) => RANK[item.kind] > RANK[best] ? item.kind : best, "patch");
  publish(kind, [...new Set(parsed.map((item) => item.text))], opts.title, opts.dryRun);
} else if (["patch", "minor", "major"].includes(mode)) {
  if (!opts.positionals.length) fail(`informe uma descrição do que mudou.\n${USAGE}`);
  publish(mode, opts.positionals, opts.title, opts.dryRun);
} else fail(`modo inválido.\n${USAGE}`);
