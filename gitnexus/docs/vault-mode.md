# Vault Mode

GitNexus's vault mode visualizes Obsidian-flavored markdown vaults — knowledge graphs of notes, contacts, projects, and topics — with the same density and clustering as code repos.

## Quick start

```bash
gitnexus analyze /path/to/your/vault --mode=vault
gitnexus serve
# Open https://gitnexus.vercel.app
```

## What gets parsed

- **YAML frontmatter** keys `participants`, `projects`, `topics`, `tags` produce typed graph entities
- **`[[wikilinks]]`** in note bodies become LINKS_TO edges between Notes (and to Person/Project/Topic where relevant)
- **Auto-generated** `project/<name>` and `topic/<name>` tags are stripped (covered by the dedicated arrays)

## Node types

| Label | Meaning |
| --- | --- |
| Note | One markdown file |
| Person | Participant or contact |
| Project | Top-level category (Ecopile, SnapJacket, etc.) |
| Topic | Cross-cutting topic (Pricing, Engineering, etc.) |
| Tag | Free-form user tags |

## Edge types

| Type | From → To | Source |
| --- | --- | --- |
| PARTICIPATES_IN | Person → Note | `participants:` array |
| MEMBER_OF | Note → Project | `projects:` array |
| TAGGED | Note → Topic | `topics:` array |
| LABELED | Note → Tag | `tags:` array |
| LINKS_TO | Note → Note (or Person/Project/Topic) | inline `[[wikilinks]]` |

## Mode detection

By default, GitNexus auto-detects vault mode if either:
- A `.obsidian/` directory exists at the repo root, OR
- ≥30% of files are `.md`/`.mdx` AND ≥10% of those contain `[[wikilink]]` patterns

Force the mode explicitly with `--mode=vault` (vault only), `--mode=code` (code only), or `--mode=hybrid` (both phases run).

## UI features

- **Categories panel** — toggle visibility of entire projects or topics
- **Hide intra-cluster edges** — declutter the dense within-project links
- **Edge confidence slider** — hide low-confidence edges below a threshold

## Architecture

The vault pipeline adds two phases to GitNexus's 12-phase DAG:

1. `vault` — parses frontmatter and wikilinks, emits typed nodes and edges. Depends on `structure`. Runs in `vault` and `hybrid` modes.
2. `vaultCommunities` — runs Leiden community detection on the wikilink subgraph (only Note→Note LINKS_TO edges) to produce per-cluster colors. Depends on `vault`. Skipped if `--skipGraphPhases` is set.

Both phases are independent of the existing code-mode phases (parse, mro, communities). A `hybrid` mode is provided for repos with both code AND notes.

The `gitnexus-web/` UI adds:
- 5 new node types (Note/Person/Project/Topic/Tag) with distinct colors and force-layout mass values
- A Categories sidebar tab listing projects and topics with checkbox visibility toggles
- Edge density filters in the Filters tab (intra-cluster suppression and confidence threshold)
