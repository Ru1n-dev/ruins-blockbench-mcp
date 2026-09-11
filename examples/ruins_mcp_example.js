// Optional Blockbench plugin showing how to expose a native operation to MCP.
// Load this file only when trying the extension API example.
(function () {
  let unregister;
  function cleanup() {
    unregister?.();
    unregister = undefined;
  }
  function register() {
    const api = globalThis.RuinBlockBenchMCP ?? globalThis.PerfectBlockbenchMCP;
    if (!api) return;
    unregister = api.register({
      id: "ruins_mcp_example:inflate_selected",
      plugin: "ruins_mcp_example",
      description: "Set inflation on selected cubes as one native Undo entry.",
      schema: api.schema
        .object({ amount: api.schema.number().min(-1).max(8) })
        .strict(),
      available: () =>
        !!Project && Format.id === "free" && Cube.selected.length > 0,
      run({ amount }, { project, signal }) {
        if (signal.aborted || Project !== project)
          throw new Error("Project changed or adapter unloaded");
        const cubes = [...Cube.selected];
        if (!cubes.length) throw new Error("Select cubes first");
        Undo.initEdit({ elements: cubes });
        try {
          for (const cube of cubes) cube.inflate = amount;
          Canvas.updateAll();
          Undo.finishEdit("Ruin's MCP example: inflate cubes");
        } catch (error) {
          Undo.cancelEdit(true);
          Canvas.updateAll();
          throw error;
        }
        return { ids: cubes.map((c) => c.uuid), amount };
      },
    });
  }
  BBPlugin.register("ruins_mcp_example", {
    title: "Ruin's MCP Extension Example",
    author: "Ruin's BlockBenchMCP contributors",
    description: "Optional example adapter for Ruin's BlockBenchMCP",
    version: "0.1.0",
    min_version: "5.1.6",
    variant: "desktop",
    onload() {
      Blockbench.on("ruins_mcp_ready", register);
      Blockbench.on("ruins_mcp_unload", cleanup);
      register();
    },
    onunload() {
      cleanup();
      Blockbench.removeListener("ruins_mcp_ready", register);
      Blockbench.removeListener("ruins_mcp_unload", cleanup);
    },
  });
})();
