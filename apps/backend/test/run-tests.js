"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = test;
exports.run = run;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
async function run() {
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`OK  - ${t.name}`);
        }
        catch (e) {
            failed++;
            console.error(`FAIL- ${t.name}:`, e?.message || e);
        }
    }
    if (failed > 0)
        process.exit(1);
}
if (require.main === module) {
    (async () => { await run(); })();
}
//# sourceMappingURL=run-tests.js.map