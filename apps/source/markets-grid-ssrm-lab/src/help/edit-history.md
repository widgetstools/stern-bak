# Edit History

The **Edit History** module provides a session-scoped undo/redo journal for all editing modules on a grid.

## Toolbar

When `showEditHistoryToolbar` is enabled on `MarketsGrid`, a pinned row appears below the primary toolbar with **Undo**, **Redo**, and an entry count.

## Monitor panel

Open **Settings → Edit History** to:

- Enable or suspend recording
- Configure max stack depth and **Unify undo** (disables AG Grid built-in cell undo when on)
- Toggle which edit sources are journaled (Smart Edit, bulk update, in-cell editor, etc.)
- Review the monitor table and undo individual entries

**Cell editor** edits are recorded by default (`recordSources.cellEditor: true`). The module wraps editable column `valueSetter`s so commits reach the journal even when AG Grid omits `cellValueChanged` on inline stop. Undo/redo restores the prior cell value via the shared journal when **Unify undo** is enabled (AG Grid built-in cell undo is disabled).

## Lab profiles

Import [`public/lab-profiles/smart-edit/`](../../public/lab-profiles/smart-edit/). Profile **04 · History + undo** enables the history toolbar alongside Smart Edit.

## Integration

Editing modules record `CellPatch` entries via the shared `EditJournal`. One user action = one undo step. Stacks are session-only; profile persistence stores module settings, not undo stacks.
