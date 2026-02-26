#!/usr/bin/env node
import fs from 'node:fs';

const [, , schemaPath, filePath] = process.argv;
if (!schemaPath || !filePath) {
  console.error('usage: node validate.mjs <schema.json> <payload.json>');
  process.exit(2);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const errors = [];
const required = schema.required || [];
for (const k of required) {
  if (!(k in payload)) errors.push(`missing required key: ${k}`);
}

if (schema.properties) {
  for (const [k, cfg] of Object.entries(schema.properties)) {
    if (!(k in payload)) continue;
    const v = payload[k];
    if (cfg.type === 'string' && typeof v !== 'string') errors.push(`${k}: expected string`);
    if (cfg.type === 'array' && !Array.isArray(v)) errors.push(`${k}: expected array`);
    if (cfg.type === 'object' && (typeof v !== 'object' || v === null || Array.isArray(v))) errors.push(`${k}: expected object`);
    if (cfg.type === 'integer' && !Number.isInteger(v)) errors.push(`${k}: expected integer`);
    if (cfg.enum && !cfg.enum.includes(v)) errors.push(`${k}: value not in enum`);
    if (cfg.minLength && typeof v === 'string' && v.length < cfg.minLength) errors.push(`${k}: below minLength`);
  }
}

if (errors.length) {
  console.error('schema-validate: FAIL');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log('schema-validate: PASS');
