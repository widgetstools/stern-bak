# Recipe: STOMP positions provider

```bash
# Tools
starui_generate_stomp_config --clientTag TRADER001 --dataType positions
starui_setup_stomp_dev --projectDir ./my-app
starui_test_stomp_connection
```

Wire `ensureStompProvider()` before `HostedMarketsGrid` mounts.
