#!/usr/bin/env node
import process from "node:process";
import { config } from "../src/config.js";
import { validateProductionReadiness } from "../src/preflight.js";

const result = validateProductionReadiness(config);

if (result.warnings.length) {
  console.log("Production preflight warnings:");
  for (const warning of result.warnings) {
    console.log(`- ${warning}`);
  }
}

if (!result.ok) {
  console.error("Production preflight failed:");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production preflight passed");
