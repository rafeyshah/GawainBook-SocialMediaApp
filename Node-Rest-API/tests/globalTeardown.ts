import fs from "fs";

export default async function globalTeardown() {
  const state = (globalThis as Record<string, unknown>).__PG__ as { pg: { stop(): Promise<void> }; dir: string } | undefined;
  if (!state) return;
  await state.pg.stop();
  fs.rmSync(state.dir, { recursive: true, force: true });
}
