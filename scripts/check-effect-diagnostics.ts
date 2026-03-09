import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const projects = [
  { name: "server", tsconfig: "apps/server/tsconfig.json" },
  { name: "contracts", tsconfig: "packages/contracts/tsconfig.json" },
  { name: "web", tsconfig: "apps/web/tsconfig.json" },
] as const;

const runDiagnostics = async (project: (typeof projects)[number]) => {
  const tsconfigPath = path.join(workspaceRoot, project.tsconfig);
  const projectRoot = path.dirname(tsconfigPath);
  const cliPath = path.join(projectRoot, "node_modules/@effect/language-service/cli.js");

  await access(cliPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "diagnostics", "--project", tsconfigPath], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Effect diagnostics failed for ${project.name} (${project.tsconfig}) with exit code ${code ?? "unknown"}`));
    });
  });
};

for (const project of projects) {
  console.log(`\n> ${project.name}`);
  await runDiagnostics(project);
}
