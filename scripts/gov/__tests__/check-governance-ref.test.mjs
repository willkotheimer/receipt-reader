import { describe, it, expect } from 'vitest';
import { parseGovernanceRefs, validateCommitMessage } from '../check-governance-ref.mjs';

// governance.md §3 Departure Protocol:
//   "Pre-commit hooks parse git commit messages and PR bodies for Governance-Ref: tags
//    and block approval if no matching ADR markdown file is present."

const AVAILABLE = new Set(['ADR-0001']);

describe('parseGovernanceRefs', () => {
  it('extracts every clause from a multi-clause tag', () => {
    const { sections } = parseGovernanceRefs('subject\n\nGovernance-Ref: §3, §6, §10\n');
    expect(sections).toEqual(['§3', '§6', '§10']);
  });

  it('accepts the ASCII "Section N" spelling as well as the § glyph', () => {
    const { sections } = parseGovernanceRefs('subject\n\nGovernance-Ref: Section 8\n');
    expect(sections).toEqual(['§8']);
  });

  it('finds ADR tokens anywhere in the body, not only on the tag line', () => {
    const message = [
      'feat: swap the error envelope',
      '',
      'Departure recorded in ADR-0042 after review.',
      '',
      'Governance-Ref: §1',
    ].join('\n');

    expect(parseGovernanceRefs(message).adrs).toEqual(['ADR-0042']);
  });

  it('de-duplicates an ADR cited more than once', () => {
    const message = 'ADR-0007 and again ADR-0007\n\nGovernance-Ref: §3';
    expect(parseGovernanceRefs(message).adrs).toEqual(['ADR-0007']);
  });

  it('identifies a merge commit', () => {
    expect(parseGovernanceRefs("Merge branch 'main' into feature").isMerge).toBe(true);
    expect(parseGovernanceRefs('S2: add the pin gate').isMerge).toBe(false);
  });
});

describe('validateCommitMessage', () => {
  it('passes a commit carrying a well-formed tag and no ADR', () => {
    const message = 'S2: add the pin gate\n\nGovernance-Ref: §10';
    expect(validateCommitMessage(message, AVAILABLE)).toEqual([]);
  });

  it('passes a commit citing an ADR that exists on disk', () => {
    const message = 'docs: record the decision\n\nGovernance-Ref: §3, ADR-0001';
    expect(validateCommitMessage(message, AVAILABLE)).toEqual([]);
  });

  it('fails a commit with no Governance-Ref tag at all', () => {
    const violations = validateCommitMessage('chore: tidy up', AVAILABLE);

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('missing-governance-ref');
  });

  it('fails a tag that names no clause', () => {
    const violations = validateCommitMessage('subject\n\nGovernance-Ref:', AVAILABLE);

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('malformed-governance-ref');
  });

  it('fails a commit citing an ADR with no matching file — the dangling-reference case', () => {
    const message = 'feat: deviate\n\nGovernance-Ref: §1, ADR-0042';
    const violations = validateCommitMessage(message, AVAILABLE);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ reason: 'unknown-adr', detail: 'ADR-0042' });
  });

  it('fails a commit citing the template, which is not a decision', () => {
    const message = 'feat: deviate\n\nGovernance-Ref: §1, ADR-0000';
    const violations = validateCommitMessage(message, new Set(['ADR-0000', 'ADR-0001']));

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('template-not-a-decision');
  });

  it('reports every dangling ADR, not just the first', () => {
    const message = 'feat: x\n\nGovernance-Ref: §1, ADR-0042, ADR-0043';
    const violations = validateCommitMessage(message, AVAILABLE);

    expect(violations.map((v) => v.detail)).toEqual(['ADR-0042', 'ADR-0043']);
  });

  it('skips merge commits, which carry no authored subject to tag', () => {
    const message = "Merge pull request #2 from willkotheimer/pr2-governance-gate-toolkit";
    expect(validateCommitMessage(message, AVAILABLE)).toEqual([]);
  });

  it('ignores comment lines, so the git commit template cannot satisfy the gate', () => {
    const message = 'subject\n\n# Governance-Ref: §3\n';
    const violations = validateCommitMessage(message, AVAILABLE);

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('missing-governance-ref');
  });
});
