#!/usr/bin/env node

// src/bin.ts
var import_cac = require("cac");
var import_path = require("path");
var import__ = require(".");
var import_package = require("../package.json");
var cli = (0, import_cac.cac)("koishi-console").help().version(import_package.version);
cli.command("build [root]").action((root) => {
  root = (0, import_path.resolve)(process.cwd(), root || ".");
  (0, import__.build)(root);
});
cli.parse();
if (!cli.matchedCommand && !cli.options.help) {
  cli.outputHelp();
}
//# sourceMappingURL=bin.js.map
