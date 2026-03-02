# feed-article-list-display-mode Specification

## Purpose
TBD - created by archiving change feed-article-list-display-mode. Update Purpose after archive.
## Requirements
### Requirement: Feed-specific article display mode persistence
The system SHALL persist article list display mode per feed using `articleListDisplayMode` with allowed values `card` and `list`, and MUST default to `card` for feeds without explicit user changes.

#### Scenario: Save display mode for a feed
- **WHEN** a user is viewing a specific feed and toggles display mode from `card` to `list`
- **THEN** the system persists `articleListDisplayMode = 'list'` for that feed
- **THEN** a later snapshot for the same feed returns `articleListDisplayMode = 'list'`

#### Scenario: Default display mode for existing feeds
- **WHEN** a feed has no prior display mode record
- **THEN** the system returns `articleListDisplayMode = 'card'`

### Requirement: Aggregate views always render in card mode
The system SHALL force `card` rendering for aggregate views (`all`, `unread`, `starred`) regardless of any feed-specific display mode values.

#### Scenario: Open aggregate view after feed switched to list
- **WHEN** a user has at least one feed with `articleListDisplayMode = 'list'`
- **THEN** switching to `all`, `unread`, or `starred` renders articles in `card` mode
- **THEN** display mode toggle control is not shown in aggregate views

### Requirement: List mode visual contract
In `list` mode, each article row SHALL render as left-aligned title and right-aligned relative publish time, while preserving date section headers and unread indicator semantics.

#### Scenario: Render list mode row
- **WHEN** a specific feed is in `list` mode
- **THEN** each row shows the title on the left and `formatRelativeTime(publishedAt)` on the right
- **THEN** unread articles remain visually distinguishable from read articles
- **THEN** date grouping headers remain visible above grouped rows

### Requirement: Toggle failure recovery
Display mode toggling MUST use optimistic UI update and SHALL roll back to the previous mode if persistence fails.

#### Scenario: Persistence request fails
- **WHEN** the user toggles display mode and the `PATCH /api/feeds/:id` request fails
- **THEN** the UI reverts to the previous mode
- **THEN** the system shows an error notification to the user

