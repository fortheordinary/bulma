export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform
  const cmd =
    platform === "darwin"
      ? ["open", url]
      : platform === "win32"
        ? ["cmd", "/c", "start", '""', url]
        : ["xdg-open", url]
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" })
  } catch {
    // ignore — fallback printed by caller
  }
}
