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
      reviewerModels: optionalEnv('REVIEWER_MODELS'),
      confirmModel: optionalEnv('CONFIRM_MODEL'),
      reasoningEffort: optionalEnv('REASONING_EFFORT'),
    });
    setOutput('reviewer_models_json', JSON.stringify(config.reviewerModels));
    console.log(
      `Config OK. Reviewers: ${config.reviewerModels.join(', ')}; ` +
        `confirm: ${config.confirmModel}; effort: ${config.reasoningEffort}.`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
