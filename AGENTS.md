# AGENTS.md

## Project Mission

Build a modern web replacement for the Java desktop CWMS data client. This is a dense operational data workbench for USACE water management users, not a marketing site or demo shell.

The application must preserve the power-user workflows shown in the legacy desktop screenshots while improving usability where the old UI is cramped, especially time series creation/data entry, shared selections, plotting/tabulation, column layouts, and alias-driven metadata.

## Required Stack

- React
- Vite
- TypeScript
- USACE Groundwork React components: `@usace/groundwork`
- CWMS Data API JavaScript client: `cwmsjs`
- CWMS Data API OpenAPI docs: https://cwms-data.usace.army.mil/cwms-data/swagger-docs

Use Groundwork components where they fit the app shell, forms, dialogs, buttons, and general UI. For highly specialized dense grids and charts, use appropriate React libraries and style them to feel consistent with Groundwork.

Use Bootstrap components where Groundwork does not have relevant components.

## Product Shape

The first screen is the actual workbench. Do not build a landing page, marketing hero, decorative splash screen, or tutorial-first experience.

The core tabs are:

- Time Series
- Ratings
- Location Levels
- Location Groups
- Time Series Groups
- Locations
- Measurements

Do not implement the old `Time Series (Legacy)` tab.

Future exports to Excel, JSON, CSV, and HEC-DSS are planned, but they are not initial requirements. Keep the data model and plotting/tabulation architecture export-ready without implementing export workflows up front.

## Application Layout

Use a dense desktop-like web app layout:

- Top app shell/header with data source, selected office, user/login state when available, data-set count, selected count, and session/status metadata.
- Main tab navigation for the seven supported tabs.
- Reusable inventory grid surface per tab.
- Right-side column/layout drawer with nested column groups, show/hide controls, show all/default columns, and saved layouts.
- Shared bottom selection tray that can hold selections from multiple tabs.
- Footer/status bar showing current time window, timezone, and unit system.

Avoid excessive whitespace, oversized cards, hero typography, or ornamental visual treatments. This is an operations tool for repeated scanning, filtering, and action.

## API Architecture

Wrap all CDA access behind local service modules. Do not call `cwmsjs` directly from React components except in temporary prototypes that are immediately refactored.

Preferred structure:

- `src/api/cdaClient.ts`
- `src/services/timeSeriesService.ts`
- `src/services/ratingsService.ts`
- `src/services/levelsService.ts`
- `src/services/locationGroupsService.ts`
- `src/services/timeSeriesGroupsService.ts`
- `src/services/locationsService.ts`
- `src/services/measurementsService.ts`

Use the live CDA OpenAPI docs as authoritative when endpoint behavior is unclear. Use `cwmsjs` where practical. If an endpoint mapping is uncertain, create a narrow service function with typed inputs/outputs and a clear TODO describing the endpoint or schema question.

All API-backed views must support:

- loading state
- empty state
- error state
- retry behavior
- cancellation or stale-response protection where users can change filters rapidly
- paginated CDA queries that follow all `next-page`, cursor, or page-token values until the inventory is exhausted, unless the user explicitly requests a limited page

## State Management

Maintain central state for:

- CDA base URL/data source
- selected office
- current user/login state when available
- global time window
- timezone
- unit system
- tab state
- grid filters/sorts
- column visibility/layouts
- shared selected entities

Persist user preferences where appropriate, especially:

- time window when `retain between sessions` is enabled
- column layouts
- visible alias columns
- selected office/data source if safe for the deployment context

## Reusable Inventory Grid

Most tabs are dense inventory grids. Implement a reusable grid pattern with:

- grouped column headers
- per-column search/filter inputs for every visible column
- sorting
- resizable and reorderable columns
- pinned/frozen key columns
- row selection
- tree/expandable rows
- horizontal scrolling
- row virtualization for large inventories
- column visibility and saved layouts
- detail drawer on row click
- keyboard-friendly navigation where the chosen grid library supports it

The grid must handle thousands of rows without freezing the UI.

Do not assume CDA inventory/table endpoints return complete result sets in one request. Table services must be page-aware, expose page loading metadata when useful, and keep fetching subsequent pages before presenting a complete inventory view.

## Alias and Group Metadata

Location Categories/Groups and Time Series Categories/Groups are first-class metadata. Do not treat alias columns as hard-coded display-only fields.

Location Groups drive alias columns in other tabs. For example, Location Category `Agency Aliases` may contain groups such as:

- USGS GNIS ID
- NWS Handbook 5 ID
- USBR Station ID
- NRCS Station ID
- CBT Station ID
- USGS Station Number
- SHEF Location ID
- NIDID
- DCP Platform ID
- USGS Station Name
- LRD

These alias/group values should be available as optional columns in Time Series, Ratings, Location Levels, Locations, and Measurements where applicable.

Time Series Categories/Groups similarly provide metadata and alias/group columns for Time Series inventory views.

## Shared Selection Tray

The bottom selection tray is a central workflow feature. It must hold selections from multiple tabs, not only the active tab.

Selections may include:

- time series IDs
- rating specifications/curves
- location levels
- location groups
- time series groups
- locations
- measurements

The tray should support:

- add selected rows
- deselect/remove
- clear selections
- restore selections
- plot selected compatible items
- tabulate selected compatible items

When selecting a group, provide a clear way to either select the group itself or expand it into member entities when that is useful for plotting/tabulation.

## Global Time Window

Implement a global Time Window dialog. It limits plot and tabulation requests.

Required modes:

- No Time Window
- Specific Time Window
  - start date
  - start time
  - end date
  - end time
  - clear
  - set current time
- Relative to Current Time
  - go back value and unit
  - go forward value and unit
- By Individual Water Year
  - start date of water year
- Retain Between Sessions

The selected time window must be visible in the footer/status bar and consistently applied to plot/tabulate API calls.

## Tab Requirements

### Time Series

Display a dense inventory of CWMS time series identifiers.

Parse and display identifier parts:

- office
- location
- parameter
- type
- interval
- duration
- version
- interval offset
- timezone

Also support long/public names, version date, data entry date, first/last date, acquisition metadata, geography, location alias columns, and time-series group/alias metadata.

Column groups include:

- Identification
- Time Range
- Data Acquisition
- Geography
- Agency Aliases / Location aliases
- Time Series Groups / aliases

Users must be able to filter, sort, select, inspect details, add to shared tray, plot, tabulate, and set time window.

### Time Series Creation and Data Entry

Do not copy the cramped desktop dialog directly. Replace it with a modern full-page editor or large side panel.

Required capabilities:

- live CWMS time series ID preview
- office selector
- location autocomplete
- create-new-location affordance
- parameter selector
- sub-parameter selector
- parameter type selector
- interval selector
- interval offset
- regular/irregular toggle
- duration
- version
- timezone
- units
- start date/time
- manual entry grid
- paste/import support
- automatic generation mode
- validation before save
- plot preview
- save, cancel, plot, and graphical edit actions

Use inline validation, friendly paste parsing, and a clearer layout than the legacy desktop modal.

### Ratings

Use hierarchical rows:

- Template
- Rating Specifications
- Rating curve entries/versions beneath specifications

Column groups include:

- Rating Curve
- Identification
- Source
- Temporal Interpolation
- Independent Parameter 1
- Independent Parameter 2
- Independent Parameter 3
- Independent Parameter 4
- Independent Parameter 5
- Geography
- Location aliases

Support expansion, filtering, sorting, selection, detail drawers, shared tray integration, and plot/tabulate where applicable.

### Location Levels

Use tree rows for:

- Specified Levels
- Location Levels
- effective-date/value rows beneath a level

Column groups include:

- Identification
- Specified Level
- Location Level
- Level Value
- Geography
- Location aliases

Support level values including expiration date, value type, units, interpolate flag, interval origin, calendar interval month, and time interval minute.

### Location Groups

This tab manages Location Categories, Location Groups, and assigned locations.

Tree structure:

- category rows, such as `Agency Aliases`
- group rows, such as `CBT Station ID` or `NIDID`
- location/member rows

Columns:

- Category/Group/Location
- Office
- Description
- Reference Location
- Alias
- Attribute

Support browsing and editing:

- expand/collapse
- filter/sort/layouts
- edit category/group descriptions
- add/remove locations from groups
- edit alias and attribute
- save pending changes
- unsaved-change indicator
- validation before save

### Time Series Groups

This tab manages Time Series Categories, Time Series Groups, and member time series.

Tree structure:

- category rows, such as `Agency Aliases`, `Data Acquisition`, `Data Dissemination`, `Default`, `RDL_Aliases`
- group rows, such as `Reporting`
- member time series rows

Columns:

- Category/Group/Time Series
- Description
- Reference Time Series
- Alias
- Attribute

Support editing descriptions, group membership, aliases, attributes, and reference time series. Use autocomplete for time series IDs.

### Locations

Display a locations inventory.

Column groups include:

- Location
- Office
- Naming
- Geography
- Agency Aliases / Location aliases

Fields include:

- location
- office
- base location
- sub-location
- public name
- long name
- description
- location kind
- location type
- timezone
- latitude/longitude
- published latitude/longitude
- horizontal datum
- elevation
- unit
- vertical datum
- nation
- state
- county
- nearest city
- bounding office
- map label
- active flag
- alias columns from Location Categories/Groups

Row details should show aliases, geography, and related CWMS entities.

### Measurements

Display measurement summaries by location.

Column groups include:

- Identification
- Measurement
- Time Series
- Geography
- Agency Aliases / Location aliases

Fields include:

- location
- first measurement date
- last measurement date
- last measured stage
- last measured flow
- count
- max stage
- date of max stage
- max flow
- date of max flow
- current stage
- date of current stage
- current flow
- date of current flow
- timezone
- latitude/geography
- alias columns

Support filtering, sorting, selection, details, and plot/tabulate of related measurements or linked current stage/flow time series where applicable.

## Plotting and Tabulation

Create an initial plotting/tabulation workspace:

- consumes compatible entities from the shared selection tray
- applies the global time window
- respects timezone and unit system
- supports multiple selected time series
- has chart and tabular views
- allows removing items from the plot/table
- provides loading and API error states

Do not implement export workflows yet, but keep the model ready for future Excel, JSON, CSV, and HEC-DSS export.

## UX and Visual Rules

- Prioritize dense, readable operational workflows.
- Use restrained colors and clear hierarchy.
- Keep row and column behavior predictable.
- Avoid nested cards, decorative backgrounds, oversized hero sections, and marketing-style layouts.
- Use detail drawers or split panes for metadata that does not fit naturally in the grid.
- Keep dialogs large enough for the task.
- Prefer guided editors for complex creation/editing workflows.
- Ensure text fits in controls at desktop and smaller widths.
- Verify layouts in browser after substantial UI work.

## Implementation Discipline

- Prefer typed service boundaries and typed domain models.
- Keep transformations between CDA responses and grid rows isolated and tested.
- Do not mix API mapping logic directly into React components.
- Avoid hard-coding office-specific examples except in mock/sample data.
- Use mock/sample fallback data only where real API wiring is blocked.
- Add clear TODOs for endpoint questions rather than burying assumptions.
- Run build/tests before handing off when possible.
- Start the Vite dev server after substantial frontend work and verify the app visually in browser.

## Non-Goals for Initial Build

- Do not build the Time Series Legacy tab.
- Do not implement Excel/JSON/CSV/HEC-DSS export yet.
- Do not build a public landing page.
- Do not require all editing workflows to be complete if CDA write endpoints are uncertain, but build the UI and service boundaries so they can be wired cleanly.
