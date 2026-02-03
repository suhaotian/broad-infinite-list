Bun.build({
  entrypoints: ["./src/react.tsx"],
  outdir: "./dist",
  format: "esm",
  external: ["react", "react-dom"],
  // minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
