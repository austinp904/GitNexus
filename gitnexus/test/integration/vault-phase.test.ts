/**
 * Integration test: Vault pipeline phase end-to-end against the mini-vault fixture.
 *
 * Runs the full ingestion pipeline once in `mode: 'vault'` against
 * `test/fixtures/mini-vault/` and asserts node/edge counts and shapes for the
 * vault-specific outputs (Note/Person/Project/Topic/Tag + PARTICIPATES_IN /
 * MEMBER_OF / TAGGED / LABELED / LINKS_TO edges).
 *
 * Pipeline runs once in beforeAll; each it() asserts against the cached result.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';
import type { PipelineResult } from '../../src/types/pipeline.js';

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'mini-vault');

describe('vault pipeline phase (integration)', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(FIXTURE, () => {}, {
      mode: 'vault',
      skipGraphPhases: true, // skip mro/communities/processes for speed
    });
  }, 30000);

  it('produces Note nodes for every .md file', () => {
    const notes = result.graph.nodes.filter((n) => n.label === 'Note');
    expect(notes.length).toBe(11); // 5 threads + 2 people + 2 projects + 2 topics
  });

  it('produces Person nodes from participants frontmatter', () => {
    const people = result.graph.nodes.filter((n) => n.label === 'Person');
    const names = people.map((p) => p.properties.name).sort();
    expect(names).toContain('Alice Smith');
    expect(names).toContain('Bob Jones');
  });

  it('produces Project nodes from projects frontmatter', () => {
    const projects = result.graph.nodes.filter((n) => n.label === 'Project');
    const names = projects.map((p) => p.properties.name).sort();
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('produces Topic nodes from topics frontmatter', () => {
    const topics = result.graph.nodes.filter((n) => n.label === 'Topic');
    const names = topics.map((t) => t.properties.name).sort();
    expect(names).toEqual(['Engineering', 'Pricing']);
  });

  it('emits PARTICIPATES_IN edges from each Person to each Note they joined', () => {
    const edges = result.graph.relationships.filter((r) => r.type === 'PARTICIPATES_IN');
    expect(edges.length).toBeGreaterThan(0);
  });

  it('emits MEMBER_OF edges from Notes to Projects', () => {
    const edges = result.graph.relationships.filter((r) => r.type === 'MEMBER_OF');
    expect(edges.length).toBeGreaterThan(0);
  });

  it('handles malformed YAML without crashing', () => {
    // The malformed-yaml.md file should still produce a Note with frontmatterRaw set
    const malformedNote = result.graph.nodes.find(
      (n) => n.label === 'Note' && String(n.properties.filePath).includes('malformed-yaml'),
    );
    expect(malformedNote).toBeDefined();
    expect(malformedNote?.properties.frontmatterRaw).toBeDefined();
    expect(malformedNote?.properties.frontmatterJson).toBeUndefined();
  });

  it('skips auto-generated project/* and topic/* tags', () => {
    const tags = result.graph.nodes.filter((n) => n.label === 'Tag');
    const tagNames = tags.map((t) => t.properties.name);
    expect(tagNames).not.toContain('project/alpha');
    expect(tagNames).not.toContain('topic/pricing');
    expect(tagNames).toContain('urgent');
  });

  it('does not create orphan nodes for unresolved wikilinks', () => {
    const allNodes = result.graph.nodes;
    expect(allNodes.find((n) => n.properties.name === 'Nonexistent Person')).toBeUndefined();
  });

  it('emits LINKS_TO edges only between resolvable nodes', () => {
    const linksTo = result.graph.relationships.filter((r) => r.type === 'LINKS_TO');
    for (const e of linksTo) {
      // KnowledgeGraph has no hasNode(); use getNode() !== undefined.
      expect(result.graph.getNode(e.sourceId)).toBeDefined();
      expect(result.graph.getNode(e.targetId)).toBeDefined();
    }
  });
});
