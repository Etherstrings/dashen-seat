// pack: zip dist/ (index.html + assets/, nothing else) into
// release/dashen-seat-<version>.zip and copy README.md next to it.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const out = resolve(root, "release");
mkdirSync(out, { recursive: true });
const zip = resolve(out, `dashen-seat-${version}.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-X", "-q", zip, "index.html", "assets"], { cwd: resolve(root, "dist") });
copyFileSync(resolve(root, "README.md"), resolve(out, "README.md"));
console.log(execFileSync("unzip", ["-l", zip], { encoding: "utf8" }));
console.log(`${zip}  ${(statSync(zip).size / 1024).toFixed(1)} KB`);
