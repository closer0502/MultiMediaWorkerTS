import {
  cleanupTestRoot,
  ensureTestRoot
} from './helpers/testEnvironment.js';
import runAgentParsingTests from './agent/parsing.test.js';
import runAgentValidationTests from './agent/validation.test.js';
import runCommandExecutionTests from './agent/commandExecution.test.js';
import runPlannerTests from './agent/planner.test.js';
import runServerHelperTests from './server/serverHelpers.test.js';
import runServerHandleTaskRequestTests from './server/handleTaskRequest.test.js';
import runIndexExportTests from './agent/indexExports.test.js';
import runCliAvailabilityTests from './system/cliAvailability.test.js';

async function runTests() {
  await ensureTestRoot();

  try {
    await runCliAvailabilityTests();
    await runAgentParsingTests();
    await runAgentValidationTests();
    await runCommandExecutionTests();
    await runPlannerTests();
    await runServerHelperTests();
    await runServerHandleTaskRequestTests();
    await runIndexExportTests();
    // eslint-disable-next-line no-console
    console.log('All tests passed');
  } finally {
    await cleanupTestRoot();
  }
}

runTests().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
