'use strict';

function assertRequiredEditProducedDiff(scopeFiles, producedDiff, model = 'unknown') {
  const editRequired = Array.isArray(scopeFiles) && scopeFiles.length > 0;
  const changedFiles = producedDiff && Array.isArray(producedDiff.files)
    ? producedDiff.files
    : [];

  if (editRequired && changedFiles.length === 0) {
    const files = scopeFiles.join(', ');
    throw new Error(
      `Agent produced no modification: exit 0 but empty git diff. Edit was required on: ${files}. Model: ${model || 'unknown'}`
    );
  }

  return {
    editRequired,
    changedFileCount: changedFiles.length,
  };
}

module.exports = { assertRequiredEditProducedDiff };
