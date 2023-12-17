# Orchestrator Workflow Engine

For new workflow please follow below steps

1. Write workflow class
2. Write handler class if required or use existing handlers
3. Define new Handler/workflow in index.ts
4. Define workflow configuration in orchestrator-config.json.

## Configuration Validation

Configuration validation happens while application bootstrapping

1. Validates duplicate wokflow identifiers
2. Validates duplicate subscriptions
3. Validates delegate workflow defined exists
3. Cross verifies defined workflow vs Registered workflow, if there is any mismatch.