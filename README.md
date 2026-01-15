

Run it
```bash
cd opensentience.org/zed-agent
mix deps.get
mix escript.build
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{}}}\n' | ./opensentience --acp

```

Menu: Zed: (open settings file)
```json
{
  "agent_servers": {
    "OpenSentience": {
      "type": "custom",
      "command": "/home/travis/Projects/opensentience.org/zed-agent/opensentience",
      "args": ["--acp"],
      "env": {},
    }
  }
}
```
