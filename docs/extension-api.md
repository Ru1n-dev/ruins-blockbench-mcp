# Extension API

Provider plugins can add typed MCP operations without modifying the server. The Blockbench plugin exposes the API as `globalThis.RuinBlockBenchMCP` after it loads.

```javascript
(function () {
  let unregister;

  function register() {
    const api = globalThis.RuinBlockBenchMCP;
    if (!api) return;
    unregister = api.register({
      id: "my_plugin:operation",
      plugin: "my_plugin",
      description: "An operation provided by my_plugin.",
      schema: api.schema
        .object({ value: api.schema.number().finite() })
        .strict(),
      available: () => !!Project,
      async run(input, { project, signal }) {
        if (signal.aborted || Project !== project)
          throw new Error("Project changed or the provider was unloaded");
        return { value: input.value };
      },
    });
  }

  BBPlugin.register("my_plugin", {
    title: "My Plugin",
    version: "1.0.0",
    min_version: "5.1.6",
    variant: "desktop",
    onload() {
      Blockbench.on("ruins_mcp_ready", register);
      register();
    },
    onunload() {
      unregister?.();
      Blockbench.removeListener("ruins_mcp_ready", register);
    },
  });
})();
```

`schema` must be created with the API's Zod instance and must be representable as JSON Schema. Operation IDs are namespaced and must be unique. The `available` function describes runtime preconditions; it should be conservative and avoid mutating the model.

The `run` callback owns provider-specific behavior. Check `signal.aborted` and the project identity after every asynchronous step. If the callback edits a model, create and finish a native Undo entry and restore the prior state when an operation fails. Return JSON-serializable data no larger than 8 MB.

The server exposes registered operations through `bb_capabilities` with `kind: "extensions"` and invokes them through `bb_extension`. The provider remains responsible for native dialogs, external files, timers, and any side effects outside the model.

When the MCP plugin reloads, registrations are invalidated. Providers should listen for `ruins_mcp_ready` and register again, and unregister during their own unload. The legacy global `PerfectBlockbenchMCP` and `perfect_mcp_ready`/`perfect_mcp_unload` events remain available for existing providers during migration.
