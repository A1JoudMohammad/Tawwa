import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Vercel points to the API build directory rather than the frontend output", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(config.framework, "express");
  assert.equal(config.outputDirectory, "dist");
  assert.equal(config.buildCommand, "pnpm run build");
});

test("the production bundle exports a working Express app without requiring PORT on Vercel", () => {
  execFileSync(process.execPath, ["build.mjs"], { stdio: "pipe" });
  const bundle = readFileSync("dist/index.mjs", "utf8");
  // Mirrors Vercel's framework-import check, not just Node's ability to run
  // the bundle. Fully bundling Express erases this import and fails deployment.
  const vercelExpressImport = /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/;
  assert.match(bundle, vercelExpressImport, "Vercel must recognize the built entrypoint as Express");
  const env = { ...process.env, VERCEL: "1", NODE_ENV: "production" };
  delete env.PORT;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { createServer } from "node:http";
    import { once } from "node:events";
    import app from "./dist/index.mjs";
    assert.equal(typeof app, "function");
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/healthz");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `], { env, encoding: "utf8", timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
