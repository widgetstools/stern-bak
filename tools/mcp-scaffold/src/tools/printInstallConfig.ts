export function handlePrintInstallConfig(opts?: { staruiRoot?: string; tarballPath?: string }) {
  const staruiRoot = opts?.staruiRoot ?? process.env.STARUI_ROOT ?? '';
  const args = opts?.tarballPath
    ? ['-y', opts.tarballPath]
    : ['-y', '@wellsfargo-starui/mcp-scaffold'];
  const env: Record<string, string> = {};
  if (staruiRoot) env.STARUI_ROOT = staruiRoot;

  const cursor = {
    mcpServers: {
      'starui-scaffold': {
        command: 'npx',
        args,
        ...(Object.keys(env).length ? { env } : {}),
      },
    },
  };

  const vscode = {
    servers: {
      'starui-scaffold': {
        type: 'stdio',
        command: 'npx',
        args,
        ...(Object.keys(env).length ? { env } : {}),
      },
    },
  };

  const claudeCodeCli = `claude mcp add starui-scaffold -- npx ${args.join(' ')}`;

  return {
    cursor: JSON.stringify(cursor, null, 2),
    vscode: JSON.stringify(vscode, null, 2),
    claudeCodeCli,
    npxDirect: `npx ${args.join(' ')}`,
  };
}
