import {validateReviewConfig} from '@omnicraft/ai-review-core';

import {fail, optionalEnv, setOutput} from './shared/gha.js';

function main(): void {
  // The built-in GITHUB_TOKEN is always present; only the Copilot PAT secret
  // is a prerequisite that can be missing.
  const copilotToken = optionalEnv('COPILOT_CLI_TOKEN');
  if (copilotToken.trim() === '') {
    fail(
      'COPILOT_CLI_TOKEN secret is unset or empty. Create a fine-grained PAT ' +
        'with the "Copilot Requests" permission and store it as the ' +
        'COPILOT_CLI_TOKEN repository secret.',
    );
  }

  try {
    const config = validateReviewConfig({
      generalModels: optionalEnv('GENERAL_MODELS'),
      securityModels: optionalEnv('SECURITY_MODELS'),
      confirmModel: optionalEnv('CONFIRM_MODEL'),
      generalEffort: optionalEnv('GENERAL_EFFORT'),
      securityEffort: optionalEnv('SECURITY_EFFORT'),
      confirmEffort: optionalEnv('CONFIRM_EFFORT'),
    });
    setOutput('general_models_json', JSON.stringify(config.general.models));
    setOutput('security_models_json', JSON.stringify(config.security.models));
    console.log(
      `Config OK. General: ${config.general.models.join(', ')} ` +
        `(${config.general.effort}); ` +
        `security: ${config.security.models.join(', ')} ` +
        `(${config.security.effort}); ` +
        `confirm: ${config.confirm.model} (${config.confirm.effort}).`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
