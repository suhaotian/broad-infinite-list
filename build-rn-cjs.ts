#!/usr/bin/env bun
import path from "path";
const start = performance.now();

const result = await Bun.build({
  entrypoints: ["./src/react-native.tsx"],
  outdir: "./dist/cjs",
  format: "cjs",
  external: ["react", "react-dom", "react-native"],
  minify: false,
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

console.log("\n🚀 Starting build process...\n");

const end = performance.now();

const outputTable = result.outputs.map((output) => ({
  File: path.relative(process.cwd(), output.path),
  Type: output.kind,
  Size: formatFileSize(output.size),
}));

console.table(outputTable);
const buildTime = (end - start).toFixed(2);

console.log(`\n✅ Build completed in ${buildTime}ms\n`);
export {};
