/* Minimal TS test harness (no Jest): run with ts-node */
type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
export function test(name: string, fn: TestFn) { tests.push({ name, fn }); }

export async function run() {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      // eslint-disable-next-line no-console
      console.log(`OK  - ${t.name}`);
    } catch (e: any) {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`FAIL- ${t.name}:`, e?.message || e);
    }
  }
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  (async () => { await run(); })();
}

